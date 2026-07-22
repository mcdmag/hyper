import {readFileSync} from 'fs';
import {join} from 'path';

import test from 'ava';

import {NliE2eFixtureError, NliE2eFixtureProvider} from '../../app/nli/e2e-fixture-provider';
import type {AttemptId, NliInterpretationContext} from '../../typings/nli';

const fixturePath = join(__dirname, '..', 'fixtures', 'nli', 'fake-provider-e2e.jsonl');
const context = (submittedLine: string): NliInterpretationContext => ({
  attemptId: 'fixture-attempt' as AttemptId,
  submittedLine,
  shellFamily: 'powershell',
  shellVersion: '7.6.4',
  operatingSystem: 'win32',
  cwdFingerprint: 'fixture-cwd'
});

test('fixture provider stays signed out until explicit login and returns proposal data only', async (t) => {
  const provider = new NliE2eFixtureProvider(fixturePath);
  t.deepEqual(await provider.getAuthStatus(), {status: 'signed-out'});
  await t.throwsAsync(
    () => provider.interpret(context('commit the changes and create a pr'), new AbortController().signal),
    {
      instanceOf: NliE2eFixtureError,
      code: 'NLI_AUTH_REQUIRED'
    }
  );

  t.deepEqual(await provider.login(), {status: 'signed-in', accountLabel: 'Deterministic E2E fixture'});
  const result = await provider.interpret(context('commit the changes and create a pr'), new AbortController().signal);
  t.is(result.kind, 'plan');
  t.is(result.kind === 'plan' ? result.options.length : 0, 2);
  await provider.logout();
  t.deepEqual(await provider.getAuthStatus(), {status: 'signed-out'});
});

test('fixture responses are deterministic by input and call count, including malformed and offline seams', async (t) => {
  const provider = new NliE2eFixtureProvider(fixturePath);
  await provider.login();

  await t.throwsAsync(() => provider.interpret(context('retry after offline'), new AbortController().signal), {
    instanceOf: NliE2eFixtureError,
    code: 'NLI_OFFLINE'
  });
  const retried = await provider.interpret(context('retry after offline'), new AbortController().signal);
  t.is(retried.kind === 'plan' ? retried.planId : '', 'e2e-retry-plan');

  const clarification = await provider.interpret(
    context('clarify the deployment target'),
    new AbortController().signal
  );
  t.is(clarification.kind, 'clarification');
  const clarified = await provider.interpret(context('clarify the deployment target'), new AbortController().signal);
  t.is(clarified.kind === 'plan' ? clarified.planId : '', 'e2e-clarified-plan');

  const malformed = await provider.interpret(context('return malformed provider output'), new AbortController().signal);
  t.deepEqual(malformed, {version: 1, kind: 'plan', unexpected: 'invalid'});
});

test('fixture delay is abortable and only committed repository JSONL paths are accepted', async (t) => {
  const provider = new NliE2eFixtureProvider(fixturePath);
  await provider.login();
  const controller = new AbortController();
  const pending = provider.interpret(context('cancel the slow interpretation'), controller.signal);
  controller.abort();
  await t.throwsAsync(() => pending, {instanceOf: NliE2eFixtureError, code: 'NLI_CANCELLED'});

  t.throws(() => new NliE2eFixtureProvider(join(__dirname, 'nli-e2e-fixture-provider.test.ts')), {
    instanceOf: NliE2eFixtureError,
    code: 'NLI_VALIDATION_FAILED'
  });
});

test('fixture environment variable is main-only and never reaches the spawned PTY', (t) => {
  const sessionSource = readFileSync(join(__dirname, '..', '..', 'app', 'session.ts'), 'utf8');
  const windowSource = readFileSync(join(__dirname, '..', '..', 'app', 'ui', 'window.ts'), 'utf8');
  t.regex(windowSource, /process\.env\.HYPER_NLI_E2E_FIXTURE/);
  t.regex(sessionSource, /delete baseEnv\.HYPER_NLI_E2E_FIXTURE/);
  t.false(windowSource.includes('HYPER_NLI_E2E_INPUT'));
  t.false(windowSource.includes('JSON.stringify(state)'));
});
