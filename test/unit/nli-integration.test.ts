import {readFileSync} from 'fs';
import {join} from 'path';

import test from 'ava';

import {fingerprintWorkingDirectory, OscEventParser, ShellSemanticEventGate} from '../../app/nli/osc-parser';
import type {NliPreferencesStore} from '../../app/nli/preferences';
import {NliService} from '../../app/nli/service';
import type {
  CallbackId,
  NliAuthState,
  NliClock,
  NliDisplayState,
  NliProvider,
  NliProviderResult,
  OptionId,
  PlanId,
  SessionUid,
  ShellSemanticEvent
} from '../../typings/nli';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const windowUid = 'integration-window';
const nonce = '0123456789abcdef'.repeat(4);
const cwd = 'C:\\repo';
const shell = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';

class IntegrationClock implements NliClock {
  now = () => Date.now();
  setTimeout = (callback: () => void, delayMs: number) => setTimeout(callback, delayMs);
  clearTimeout = (handle: unknown) => clearTimeout(handle as NodeJS.Timeout);
}

class IntegrationProvider implements NliProvider {
  calls = 0;
  trace: string[];
  auth: NliAuthState = {status: 'signed-in'};
  result: NliProviderResult = {
    version: 1,
    kind: 'plan',
    planId: 'integration-plan' as PlanId,
    summary: 'Safe integration proposal.',
    options: [
      {
        optionId: 'integration-option' as OptionId,
        label: 'Print marker',
        rationale: 'Deterministic fake provider.',
        assumptions: [],
        purpose: 'Prove shell-first ordering.',
        shellText: "Write-Output 'INTEGRATION_READY'"
      }
    ]
  };

  constructor(trace: string[]) {
    this.trace = trace;
  }

  getAuthStatus() {
    return Promise.resolve(this.auth);
  }
  login() {
    return Promise.resolve(this.auth);
  }
  cancelLogin() {
    return Promise.resolve();
  }
  logout() {
    return Promise.resolve();
  }
  interpret() {
    this.calls++;
    this.trace.push('provider');
    return Promise.resolve(this.result);
  }
  dispose() {
    return Promise.resolve();
  }
}

const preferences: NliPreferencesStore = {
  path: 'memory/nli-integration.json',
  load: () =>
    Promise.resolve({
      privacyNoticeVersion: 1,
      includeWorkingDirectory: false,
      includeGitMetadata: false
    }),
  save: (value) => Promise.resolve({privacyNoticeVersion: 1, ...value}),
  reset: () => Promise.resolve()
};

const makeEvent = (sessionUid: SessionUid, submittedLine: string, callback = 'a'.repeat(32)): ShellSemanticEvent => ({
  windowUid,
  sessionUid,
  callbackId: callback as CallbackId,
  reason: 'command-not-found',
  submittedLine,
  shellFamily: 'powershell',
  shellVersion: '7.6.4',
  historyId: callback.slice(0, 8),
  providerName: 'FileSystem',
  cwdFingerprint: fingerprintWorkingDirectory(cwd, 'FileSystem', 'win32')
});

const encodeMarker = (event: ShellSemanticEvent, markerNonce = nonce) => {
  const payload = {
    v: 1,
    windowUid: event.windowUid,
    sessionUid: event.sessionUid,
    callbackId: event.callbackId,
    reason: event.reason,
    submittedLine: event.submittedLine,
    shellVersion: event.shellVersion,
    historyId: event.historyId,
    providerName: event.providerName,
    providerPath: cwd
  };
  return `\u001b]1337;HyperNLI;1;${markerNonce};${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}\u0007`;
};

const makeHarness = (sessionUids: readonly SessionUid[]) => {
  const states: NliDisplayState[] = [];
  const trace: string[] = [];
  const provider = new IntegrationProvider(trace);
  let providerCreations = 0;
  const service = new NliService({
    windowUid,
    approvalIdentity: {windowId: 1, rendererId: 2},
    enabled: () => true,
    preferences,
    providerFactory: () => {
      providerCreations++;
      return provider;
    },
    clock: new IntegrationClock(),
    nonceSource: {create: () => `integration-${states.length}-${provider.calls}`},
    emitState: (state) => states.push(state),
    getSessionSnapshot: (sessionUid) => (sessionUids.includes(sessionUid) ? {shell, workingDirectory: cwd} : undefined),
    operatingSystem: 'win32',
    includeWorkingDirectory: () => false,
    includeGitMetadata: () => false,
    maxOptions: () => 3
  });
  return {
    service,
    states,
    trace,
    provider,
    get providerCreations() {
      return providerCreations;
    }
  };
};

test('valid commands and ordinary nonzero exits stay on the PTY hot path with zero providers', (t) => {
  const sessionUid = 'integration-valid' as SessionUid;
  const harness = makeHarness([sessionUid]);
  const ptyWrites: string[] = [];
  const dispatch = (line: string) => {
    ptyWrites.push(`${line}\r`);
    harness.service.onUserInput(sessionUid);
  };

  dispatch('Get-Location');
  dispatch("pwsh -NoProfile -Command 'exit 9'");

  t.deepEqual(ptyWrites, ['Get-Location\r', "pwsh -NoProfile -Command 'exit 9'\r"]);
  t.is(harness.providerCreations, 0);
  t.is(harness.provider.calls, 0);
  t.deepEqual(harness.states, []);
});

test('authenticated semantic failure flushes visible shell error before one provider interpretation', async (t) => {
  const sessionUid = 'integration-order' as SessionUid;
  const harness = makeHarness([sessionUid]);
  const event = makeEvent(sessionUid, 'describe repository status');
  const parser = new OscEventParser({
    windowUid,
    sessionUid,
    nonce,
    maxInputChars: 4096,
    includeWorkingDirectory: false,
    platform: 'win32'
  });
  const gate = new ShellSemanticEventGate({
    clock: new IntegrationClock(),
    emit: (semantic) => {
      harness.trace.push('semantic');
      harness.service.onCommandNotFound(semantic);
    }
  });
  const consume = (chunk: string) => {
    for (const token of parser.pushTokens(chunk)) {
      if (token.kind === 'semantic') gate.queue([token.event]);
      else if (token.data) gate.afterVisibleOutput(() => harness.trace.push(`visible:${token.data}`));
    }
  };

  consume(encodeMarker(event));
  t.deepEqual(harness.trace, []);
  consume('describe repository status: The term is not recognized.\r\n');
  await flush();
  await flush();

  t.is(harness.provider.calls, 1);
  t.true(harness.trace[0].startsWith('visible:'));
  t.deepEqual(harness.trace.slice(1), ['semantic', 'provider']);
  t.is(harness.states.at(-1)?.status, 'review');
  gate.dispose();
});

test('wrong-nonce spoofing remains visible and cannot create a provider', async (t) => {
  const sessionUid = 'integration-spoof' as SessionUid;
  const harness = makeHarness([sessionUid]);
  const parser = new OscEventParser({
    windowUid,
    sessionUid,
    nonce,
    maxInputChars: 4096,
    includeWorkingDirectory: false,
    platform: 'win32'
  });
  const spoof = encodeMarker(makeEvent(sessionUid, 'spoofed natural language'), 'f'.repeat(64));
  const parsed = parser.push(spoof);
  for (const event of parsed.events) harness.service.onCommandNotFound(event);
  await flush();

  t.is(parsed.visible, spoof);
  t.deepEqual(parsed.events, []);
  t.is(harness.providerCreations, 0);
});

test('two panes retain isolated attempts while the existing session data path remains unchanged', async (t) => {
  const first = 'integration-pane-one' as SessionUid;
  const second = 'integration-pane-two' as SessionUid;
  const harness = makeHarness([first, second]);
  harness.service.onCommandNotFound(makeEvent(first, 'first pane request', 'b'.repeat(32)));
  harness.service.onCommandNotFound(makeEvent(second, 'second pane request', 'c'.repeat(32)));
  await flush();
  await flush();

  const reviews = harness.states.filter((state) => state.status === 'review');
  t.deepEqual(new Set(reviews.map((state) => state.sessionUid)), new Set([first, second]));
  t.is(harness.provider.calls, 2);

  const windowSource = readFileSync(join(__dirname, '..', '..', 'app', 'ui', 'window.ts'), 'utf8');
  t.regex(windowSource, /rpc\.on\('data',[\s\S]*?session\.write\(data\)/);
});
