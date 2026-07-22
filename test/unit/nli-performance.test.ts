import {readFileSync} from 'fs';
import {join} from 'path';

import test from 'ava';

import type {NliPreferencesStore} from '../../app/nli/preferences';
import {NliService} from '../../app/nli/service';
import type {NliClock, NliProvider, SessionUid} from '../../typings/nli';

const ITERATIONS = 10_000;
const MAX_INCREMENTAL_P95_MS = 1;
const sessionUid = 'performance-session' as SessionUid;

const clock: NliClock = {
  now: Date.now,
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout)
};
const preferences: NliPreferencesStore = {
  path: 'memory/performance.json',
  load: () => Promise.resolve(null),
  save: (value) => Promise.resolve({privacyNoticeVersion: 1, ...value}),
  reset: () => Promise.resolve()
};

const percentile95Ms = (samples: bigint[]) => {
  samples.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return Number(samples[Math.floor(samples.length * 0.95)]) / 1_000_000;
};

const measure = (dispatch: () => void) => {
  for (let index = 0; index < 1000; index++) dispatch();
  const samples: bigint[] = [];
  for (let index = 0; index < ITERATIONS; index++) {
    const started = process.hrtime.bigint();
    dispatch();
    samples.push(process.hrtime.bigint() - started);
  }
  return percentile95Ms(samples);
};

test('10,000 disabled, unsupported, and enabled-valid dispatches keep NLI below the 1ms p95 budget', (t) => {
  let providerCreations = 0;
  let writes = 0;
  const impossibleProvider = () => {
    providerCreations++;
    throw new Error('valid input must not construct a provider');
  };
  const service = (enabled: boolean, shell: string | null) =>
    new NliService({
      windowUid: 'performance-window',
      approvalIdentity: {windowId: 1, rendererId: 2},
      enabled: () => enabled,
      preferences,
      providerFactory: impossibleProvider as () => NliProvider,
      clock,
      nonceSource: {create: () => 'performance-id'},
      emitState: () => undefined,
      getSessionSnapshot: () => ({shell, workingDirectory: 'C:\\repo'}),
      operatingSystem: 'win32',
      includeWorkingDirectory: () => false,
      includeGitMetadata: () => false,
      maxOptions: () => 3
    });
  const disabledService = service(false, 'pwsh.exe');
  const unsupportedService = service(true, 'cmd.exe');
  const enabledService = service(true, 'pwsh.exe');
  const write = () => {
    writes++;
  };

  const disabledP95 = measure(() => write());
  const unsupportedP95 = measure(() => {
    unsupportedService.onUserInput(sessionUid);
    write();
  });
  const enabledValidP95 = measure(() => {
    enabledService.onUserInput(sessionUid);
    write();
  });
  disabledService.onUserInput(sessionUid);

  t.true(unsupportedP95 - disabledP95 <= MAX_INCREMENTAL_P95_MS);
  t.true(enabledValidP95 - disabledP95 <= MAX_INCREMENTAL_P95_MS);
  t.is(providerCreations, 0);
  t.is(writes, 33_000);
});

test('the original input handler has no await, provider call, or alternate execution path before Session.write', (t) => {
  const windowSource = readFileSync(join(__dirname, '..', '..', 'app', 'ui', 'window.ts'), 'utf8');
  const dataHandler = windowSource.match(/rpc\.on\('data',[\s\S]*?\n {2}\}\);/)?.[0] || '';
  const userInputSource = NliService.prototype.onUserInput.toString();

  t.regex(dataHandler, /session\.write\(data\)/);
  t.true(dataHandler.indexOf('nliService.onUserInput') < dataHandler.indexOf('session.write'));
  t.false(dataHandler.includes('await'));
  t.false(dataHandler.includes('provider'));
  t.false(/\b(?:exec|execFile|spawn)\s*\(/.test(dataHandler));
  t.false(userInputSource.includes('await'));
  t.false(userInputSource.includes('getProvider'));
});
