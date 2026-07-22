import type {ChildProcessWithoutNullStreams} from 'child_process';
import {EventEmitter} from 'events';
import {readFileSync} from 'fs';
import {join} from 'path';
import {PassThrough} from 'stream';

import test from 'ava';

import {collectNliGitMetadata, type NliMetadataProcessFactory} from '../../app/nli/git-metadata';
import {fingerprintWorkingDirectory} from '../../app/nli/osc-parser';
import type {NliPreferencesStore} from '../../app/nli/preferences';
import {NliService, canTransitionNliState, type NliServiceOptions} from '../../app/nli/service';
import type {
  AttemptId,
  CallbackId,
  NliAuthState,
  NliClock,
  NliDisplayState,
  NliGitMetadata,
  NliNonceSource,
  NliPrivacyPreferences,
  NliProvider,
  NliProviderResult,
  PlanId,
  OptionId,
  SessionUid,
  ShellSemanticEvent
} from '../../typings/nli';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const projectPath = (...parts: string[]) => join(__dirname, '..', '..', ...parts);

class FakeClock implements NliClock {
  value = 1000;
  now = () => this.value;
  setTimeout = (callback: () => void, delayMs: number) => setTimeout(callback, delayMs);
  clearTimeout = (handle: unknown) => clearTimeout(handle as NodeJS.Timeout);
}

class FakeProvider implements NliProvider {
  auth: NliAuthState = {status: 'signed-in'};
  authCalls = 0;
  loginCalls = 0;
  interpretCalls = 0;
  disposeCalls = 0;
  lastContext: Parameters<NliProvider['interpret']>[0] | undefined;
  lastSignal: AbortSignal | undefined;
  result: NliProviderResult = {
    kind: 'plan',
    planId: 'plan-1' as PlanId,
    summary: 'Create a branch and open a pull request.',
    options: [
      {
        optionId: 'option-1' as OptionId,
        label: 'Use GitHub CLI',
        explanation: 'Commit, push, and create a pull request.',
        shellText: 'git commit -am "change"; git push; gh pr create'
      }
    ]
  };
  deferred: Promise<NliProviderResult> | undefined;

  getAuthStatus() {
    this.authCalls++;
    return Promise.resolve(this.auth);
  }
  login() {
    this.loginCalls++;
    return Promise.resolve(this.auth);
  }
  async cancelLogin() {}
  async logout() {}
  async interpret(context: Parameters<NliProvider['interpret']>[0], signal: AbortSignal) {
    this.interpretCalls++;
    this.lastContext = context;
    this.lastSignal = signal;
    return this.deferred ? this.deferred : this.result;
  }
  dispose() {
    this.disposeCalls++;
    return Promise.resolve();
  }
}

const sessionUid = 'session-1' as SessionUid;
const makeEvent = (overrides: Partial<ShellSemanticEvent> = {}): ShellSemanticEvent => ({
  windowUid: 'window-1',
  sessionUid,
  callbackId: 'callback-1' as CallbackId,
  reason: 'command-not-found',
  submittedLine: 'commit the changes and create a pr',
  shellFamily: 'powershell',
  shellVersion: '7.5.2',
  historyId: '12',
  providerName: 'FileSystem',
  cwdFingerprint: fingerprintWorkingDirectory('C:\\repo', 'FileSystem', 'win32'),
  ...overrides
});

const makePreferencesStore = (initial: NliPrivacyPreferences | null): NliPreferencesStore => {
  let value = initial;
  return {
    path: 'memory/preferences.json',
    load: () => Promise.resolve(value),
    save: (preferences) => {
      value = {privacyNoticeVersion: 1, ...preferences};
      return Promise.resolve(value);
    },
    reset: () => {
      value = null;
      return Promise.resolve();
    }
  };
};

const makeHarness = (
  privacy: NliPrivacyPreferences | null = null,
  collectGitMetadata?: NliServiceOptions['collectGitMetadata']
) => {
  const states: NliDisplayState[] = [];
  const diagnostics: NonNullable<NliServiceOptions['emitDiagnostic']> extends (arg: infer T) => void ? T[] : never = [];
  const provider = new FakeProvider();
  const clock = new FakeClock();
  let ids = 0;
  let providerCreations = 0;
  const sessionDirectories = new Map<SessionUid, string>([[sessionUid, 'C:\\repo']]);
  const sessionShells = new Map<SessionUid, string>([[sessionUid, 'C:\\Program Files\\PowerShell\\7\\pwsh.exe']]);
  const nonceSource: NliNonceSource = {create: () => `id-${++ids}`};
  const service = new NliService({
    windowUid: 'window-1',
    enabled: () => true,
    preferences: makePreferencesStore(privacy),
    providerFactory: () => {
      providerCreations++;
      return provider;
    },
    clock,
    nonceSource,
    emitState: (state) => states.push(state),
    emitDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    getSessionSnapshot: (uid) => {
      const directory = sessionDirectories.get(uid);
      return directory ? {shell: sessionShells.get(uid) || null, workingDirectory: directory} : undefined;
    },
    operatingSystem: 'win32',
    includeWorkingDirectory: () => true,
    includeGitMetadata: () => true,
    maxOptions: () => 3,
    collectGitMetadata
  });
  return {
    service,
    states,
    diagnostics,
    provider,
    clock,
    get providerCreations() {
      return providerCreations;
    },
    setDirectory(value: string, uid = sessionUid) {
      sessionDirectories.set(uid, value);
    },
    addSession(uid: SessionUid, directory = 'C:\\repo') {
      sessionDirectories.set(uid, directory);
      sessionShells.set(uid, 'C:\\Program Files\\PowerShell\\7\\pwsh.exe');
    },
    setShell(value: string, uid = sessionUid) {
      sessionShells.set(uid, value);
    }
  };
};

test('provider stays cold until an authoritative event passes privacy consent', async (t) => {
  const harness = makeHarness(null);

  t.is(harness.providerCreations, 0);
  harness.service.onCommandNotFound(makeEvent());
  t.is(harness.providerCreations, 0);
  await flush();

  t.is(harness.providerCreations, 0);
  t.deepEqual(
    harness.states.map((state) => state.status),
    ['privacy-required']
  );
});

test('one verified failure produces one proposal with a minimal consented context', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: true,
    includeGitMetadata: false
  });

  harness.service.onCommandNotFound(makeEvent());
  await flush();
  await flush();

  t.is(harness.providerCreations, 1);
  t.is(harness.provider.authCalls, 1);
  t.is(harness.provider.interpretCalls, 1);
  t.deepEqual(
    harness.states.map((state) => state.status),
    ['interpreting', 'review']
  );
  t.is(harness.provider.lastContext?.submittedLine, 'commit the changes and create a pr');
  t.is(harness.provider.lastContext?.workingDirectory, 'C:\\repo');
  t.false('git' in harness.provider.lastContext!);
  t.deepEqual(Object.keys(harness.provider.lastContext!).sort(), [
    'attemptId',
    'cwdFingerprint',
    'operatingSystem',
    'shellFamily',
    'shellVersion',
    'submittedLine',
    'workingDirectory'
  ]);
});

test('duplicates are coalesced and a newer attempt aborts only its pane predecessor', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  let resolveFirst!: (value: NliProviderResult) => void;
  harness.provider.deferred = new Promise((resolve) => {
    resolveFirst = resolve;
  });

  const first = makeEvent();
  harness.service.onCommandNotFound(first);
  harness.service.onCommandNotFound(first);
  await flush();
  t.is(harness.provider.interpretCalls, 1);

  harness.provider.deferred = undefined;
  harness.service.onCommandNotFound(
    makeEvent({callbackId: 'callback-2' as CallbackId, historyId: '13', submittedLine: 'open a pull request'})
  );
  await flush();
  await flush();

  t.true(harness.provider.lastSignal?.aborted === false);
  t.true(harness.states.some((state) => state.status === 'stale'));
  t.is(harness.provider.interpretCalls, 2);
  resolveFirst(harness.provider.result);
  await flush();
  t.is(harness.states.filter((state) => state.status === 'review').length, 1);
});

test('session disposal aborts in-flight work and late provider output cannot update a pane', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  let resolve!: (value: NliProviderResult) => void;
  harness.provider.deferred = new Promise((done) => {
    resolve = done;
  });

  harness.service.onCommandNotFound(makeEvent());
  await flush();
  const signal = harness.provider.lastSignal;
  harness.service.disposeSession(sessionUid);
  t.true(signal?.aborted);
  resolve(harness.provider.result);
  await flush();

  t.deepEqual(
    harness.states.map((state) => state.status),
    ['interpreting', 'stale']
  );
});

test('simultaneous panes retain separate attempt state', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  const secondUid = 'session-2' as SessionUid;
  harness.addSession(secondUid);
  harness.provider.auth = {status: 'signed-out'};

  harness.service.onCommandNotFound(makeEvent());
  harness.service.onCommandNotFound(
    makeEvent({
      sessionUid: secondUid,
      callbackId: 'callback-1' as CallbackId,
      submittedLine: 'push this branch',
      historyId: '2'
    })
  );
  await flush();
  await flush();

  const authStates = harness.states.filter(
    (state): state is Extract<NliDisplayState, {status: 'auth-required'}> => state.status === 'auth-required'
  );
  t.deepEqual(authStates.map((state) => state.sessionUid).sort(), [sessionUid, secondUid].sort());
  harness.service.disposeSession(sessionUid);
  t.is(harness.states.at(-1)?.sessionUid, sessionUid);

  harness.provider.auth = {status: 'signed-in'};
  await harness.service.login(secondUid);
  t.is(harness.states.at(-1)?.status, 'review');
  t.is(harness.states.at(-1)?.sessionUid, secondUid);
});

test('cwd changes make the attempt stale before provider interpretation', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  harness.setDirectory('C:\\elsewhere');

  harness.service.onCommandNotFound(makeEvent());
  await flush();
  await flush();

  t.is(harness.provider.interpretCalls, 0);
  t.is(harness.providerCreations, 0);
  t.deepEqual(
    harness.states.map((state) => state.status),
    ['stale']
  );
});

test('concurrent consent and login actions cannot duplicate interpretation', async (t) => {
  const privacyHarness = makeHarness(null);
  privacyHarness.provider.deferred = new Promise(() => undefined);
  privacyHarness.service.onCommandNotFound(makeEvent());
  await flush();

  const preferences = {includeWorkingDirectory: false, includeGitMetadata: false};
  await Promise.all([
    privacyHarness.service.setPrivacyPreferences(preferences),
    privacyHarness.service.setPrivacyPreferences(preferences)
  ]);
  await flush();
  t.is(privacyHarness.provider.interpretCalls, 1);

  const loginHarness = makeHarness({privacyNoticeVersion: 1, ...preferences});
  loginHarness.provider.auth = {status: 'signed-out'};
  loginHarness.service.onCommandNotFound(makeEvent());
  await flush();
  loginHarness.provider.auth = {status: 'signed-in'};
  await Promise.all([loginHarness.service.login(sessionUid), loginHarness.service.login(sessionUid)]);
  t.is(loginHarness.provider.loginCalls, 1);
  t.is(loginHarness.provider.interpretCalls, 1);
});

test('cancel or disable during Git collection cannot restart or invoke the provider', async (t) => {
  const metadata = {
    isRepository: true,
    branch: 'dev',
    hasStaged: false,
    hasUnstaged: true,
    hasUntracked: false,
    hasRemote: true,
    ghAvailable: true
  } as const;
  for (const action of ['cancel', 'disable'] as const) {
    let resolveGit!: (value: typeof metadata) => void;
    const harness = makeHarness(
      {privacyNoticeVersion: 1, includeWorkingDirectory: false, includeGitMetadata: true},
      () =>
        new Promise((resolve) => {
          resolveGit = resolve;
        })
    );
    harness.service.onCommandNotFound(makeEvent());
    await flush();
    await flush();
    const interpreting = harness.states.find(
      (state): state is Extract<NliDisplayState, {status: 'interpreting'}> => state.status === 'interpreting'
    );
    t.truthy(interpreting);
    if (action === 'cancel') {
      harness.service.cancel({sessionUid, attemptId: interpreting!.attemptId});
    } else {
      await harness.service.setEnabled(false);
    }
    resolveGit(metadata);
    await flush();

    t.is(harness.providerCreations, 1);
    t.is(harness.provider.interpretCalls, 0);
    t.true(harness.provider.lastSignal === undefined);
  }
});

test('cwd changes during Git collection are re-sampled before interpretation', async (t) => {
  let resolveGit!: (value: NliGitMetadata) => void;
  const harness = makeHarness(
    {privacyNoticeVersion: 1, includeWorkingDirectory: false, includeGitMetadata: true},
    () =>
      new Promise((resolve) => {
        resolveGit = resolve;
      })
  );
  harness.service.onCommandNotFound(makeEvent());
  await flush();
  await flush();
  harness.setDirectory('C:\\changed-during-git');
  resolveGit({
    isRepository: false,
    hasStaged: false,
    hasUnstaged: false,
    hasUntracked: false,
    hasRemote: false,
    ghAvailable: false
  });
  await flush();

  t.is(harness.provider.interpretCalls, 0);
  t.is(harness.states.at(-1)?.status, 'stale');
});

test('provider failures expose only typed display-safe diagnostics', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  harness.provider.auth = {
    status: 'error',
    code: 'NLI_OFFLINE',
    correlationId: 'provider-internal-id'
  };

  harness.service.onCommandNotFound(makeEvent({submittedLine: 'secret-looking failed input'}));
  await flush();

  const state = harness.states.at(-1);
  t.is(state?.status, 'error');
  t.is(state?.status === 'error' ? state.code : undefined, 'NLI_OFFLINE');
  t.false(JSON.stringify(state).includes('secret-looking'));
  t.deepEqual(Object.keys(harness.diagnostics[0]).sort(), ['code', 'component', 'correlationId', 'severity']);
});

test('legal lifecycle table makes sent, cancelled, error, and stale terminal', (t) => {
  t.true(canTransitionNliState('idle', 'detected'));
  t.true(canTransitionNliState('review', 'approving'));
  t.true(canTransitionNliState('approving', 'sent'));
  for (const state of ['sent', 'cancelled', 'error', 'stale'] as const) {
    t.false(canTransitionNliState(state, 'detected'));
  }
  t.false(canTransitionNliState('detected', 'review'));
});

test('cancel aborts one matching attempt and ignores opaque ID mismatches', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  harness.provider.deferred = new Promise(() => undefined);
  harness.service.onCommandNotFound(makeEvent());
  await flush();
  const interpreting = harness.states.find(
    (state): state is Extract<NliDisplayState, {status: 'interpreting'}> => state.status === 'interpreting'
  );
  t.truthy(interpreting);

  harness.service.cancel({sessionUid, attemptId: 'wrong' as AttemptId});
  t.false(harness.provider.lastSignal?.aborted);
  harness.service.cancel({sessionUid, attemptId: interpreting!.attemptId});
  t.true(harness.provider.lastSignal?.aborted);
  t.is(harness.states.at(-1)?.status, 'cancelled');
});

test('new user input invalidates assistance without moving work ahead of Session.write', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  harness.provider.deferred = new Promise(() => undefined);
  harness.service.onCommandNotFound(makeEvent());
  await flush();

  harness.service.onUserInput(sessionUid);
  t.true(harness.provider.lastSignal?.aborted);
  t.is(harness.states.at(-1)?.status, 'stale');

  const windowSource = readFileSync(projectPath('app', 'ui', 'window.ts'), 'utf8');
  t.regex(windowSource, /session\.write\(data\);\s*nliService\.onUserInput/);
  t.regex(
    windowSource,
    /session\.on\('data',[\s\S]*?rpc\.emit\('session data', data\)[\s\S]*?session\.on\(NLI_SESSION_EVENTS\.shellSemantic/
  );
});

test('approval-time context check re-samples cwd and exact shell identity', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  harness.service.onCommandNotFound(makeEvent());
  await flush();
  await flush();
  const review = harness.states.find(
    (state): state is Extract<NliDisplayState, {status: 'review'}> => state.status === 'review'
  );
  t.truthy(review);
  t.true(harness.service.isCurrentContext({sessionUid, attemptId: review!.attemptId}));
  harness.setDirectory('C:\\moved');
  t.false(harness.service.isCurrentContext({sessionUid, attemptId: review!.attemptId}));

  const shellHarness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  shellHarness.service.onCommandNotFound(makeEvent());
  await flush();
  await flush();
  const shellReview = shellHarness.states.find(
    (state): state is Extract<NliDisplayState, {status: 'review'}> => state.status === 'review'
  );
  t.truthy(shellReview);
  shellHarness.setShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  t.false(shellHarness.service.isCurrentContext({sessionUid, attemptId: shellReview!.attemptId}));
});

test('generated command failures are tagged so they cannot recursively invoke AI', async (t) => {
  const harness = makeHarness({
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  harness.service.tagGeneratedWrite(sessionUid, 'generated missing command');
  harness.service.onCommandNotFound(makeEvent({submittedLine: 'generated missing command'}));
  await flush();

  t.is(harness.providerCreations, 0);
  t.deepEqual(harness.states, []);
});

test('Git collection returns only the consented allowlist and never remote URLs', async (t) => {
  const calls: string[] = [];
  const responses = new Map<string, {code: number; output: string}>([
    ['git rev-parse --is-inside-work-tree', {code: 0, output: 'true\n'}],
    ['git branch --show-current', {code: 0, output: 'feature/nli\n'}],
    ['git diff --cached --quiet --exit-code', {code: 1, output: ''}],
    ['git diff --quiet --exit-code', {code: 0, output: ''}],
    ['git ls-files --others --exclude-standard', {code: 0, output: 'private-name.txt\n'}],
    ['git remote', {code: 0, output: 'origin\n'}],
    ['gh --version', {code: 0, output: 'gh version 2\n'}]
  ]);
  const factory: NliMetadataProcessFactory = {
    spawn(executable, args) {
      const key = `${executable} ${args.join(' ')}`;
      calls.push(key);
      const child = new EventEmitter() as ChildProcessWithoutNullStreams;
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      child.stdin = stdin;
      child.stdout = stdout;
      child.stderr = stderr;
      child.kill = (() => true) as ChildProcessWithoutNullStreams['kill'];
      const response = responses.get(key) || {code: 2, output: ''};
      queueMicrotask(() => {
        stdout.end(response.output);
        stderr.end();
        child.emit('close', response.code);
      });
      return child;
    }
  };

  const metadata = await collectNliGitMetadata('C:\\repo', new AbortController().signal, factory);
  t.deepEqual(metadata, {
    isRepository: true,
    branch: 'feature/nli',
    hasStaged: true,
    hasUnstaged: false,
    hasUntracked: true,
    hasRemote: true,
    ghAvailable: true
  });
  t.deepEqual(Object.keys(metadata).sort(), [
    'branch',
    'ghAvailable',
    'hasRemote',
    'hasStaged',
    'hasUnstaged',
    'hasUntracked',
    'isRepository'
  ]);
  t.false(JSON.stringify(metadata).includes('private-name'));
  t.false(JSON.stringify(metadata).includes('https://'));
  t.is(calls.filter((call) => call.startsWith('git ')).length, 6);
});
