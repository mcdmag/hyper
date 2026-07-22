import {readFileSync} from 'fs';
import {join} from 'path';

import test from 'ava';

import {
  DEFAULT_NLI_PRIVACY_PREFERENCES,
  NLI_PREFERENCES_RELATIVE_PATH,
  createNliPreferencesStore,
  type NliPreferencesFileSystem
} from '../../app/nli/preferences';
import type {AttemptId, NliApprovalRequest, OptionId, PlanId, SessionUid} from '../../typings/nli';

const projectPath = (...parts: string[]) => join(__dirname, '..', '..', ...parts);

test('natural language interface is off and private by default', (t) => {
  const defaultConfig = JSON.parse(readFileSync(projectPath('app', 'config', 'config-default.json'), 'utf8')) as {
    config: {naturalLanguageInterface: Record<string, unknown>};
  };
  t.deepEqual(defaultConfig.config.naturalLanguageInterface, {
    enabled: false,
    codexExecutable: 'codex',
    requestTimeoutMs: 30000,
    maxInputChars: 4096,
    maxOptions: 3,
    includeWorkingDirectory: false,
    includeGitMetadata: false
  });
  t.deepEqual(DEFAULT_NLI_PRIVACY_PREFERENCES, {
    privacyNoticeVersion: 1,
    includeWorkingDirectory: false,
    includeGitMetadata: false,
    shareSecretLookingInput: false
  });
});

test('opaque identifiers are not interchangeable at compile time', (t) => {
  const sessionUid = 'session' as SessionUid;
  const attemptId = 'attempt' as AttemptId;
  const planId = 'plan' as PlanId;
  const optionId = 'option' as OptionId;

  const approval: NliApprovalRequest = {
    windowId: 1,
    rendererId: 2,
    sessionUid,
    attemptId,
    planId,
    optionId,
    editRevision: 0,
    highRiskConfirmation: false
  };

  // @ts-expect-error A plan ID must not be accepted as an attempt ID.
  const invalidAttempt: AttemptId = planId;
  t.is(approval.attemptId, attemptId);
  t.is(String(invalidAttempt), String(planId));
});

test('renderer approval contract cannot carry command text', (t) => {
  const commonTypes = readFileSync(projectPath('typings', 'nli.d.ts'), 'utf8');
  const approvalContract = commonTypes.match(/export interface NliApprovalRequest \{([\s\S]*?)\n\}/)?.[1];

  t.truthy(approvalContract);
  t.false(approvalContract?.includes('shellText'));
  t.false(approvalContract?.includes('commandPreview'));
});

test('preferences use the userData-relative path and reset revokes consent', async (t) => {
  const files = new Map<string, string>();
  const fileSystem: NliPreferencesFileSystem = {
    readFile: (path) => {
      if (!files.has(path)) {
        const error = new Error('missing') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        return Promise.reject(error);
      }
      return Promise.resolve(files.get(path)!);
    },
    writeFile: (path, data) => {
      files.set(path, data);
      return Promise.resolve();
    },
    mkdir: () => Promise.resolve(),
    rename: (oldPath, newPath) => {
      files.set(newPath, files.get(oldPath)!);
      files.delete(oldPath);
      return Promise.resolve();
    },
    rm: (path) => {
      files.delete(path);
      return Promise.resolve();
    }
  };
  const store = createNliPreferencesStore('user-data', fileSystem);

  t.true(store.path.endsWith(NLI_PREFERENCES_RELATIVE_PATH));
  t.is(await store.load(), null);
  await store.save({
    includeWorkingDirectory: true,
    includeGitMetadata: false,
    shareSecretLookingInput: false
  });
  t.deepEqual(await store.load(), {
    privacyNoticeVersion: 1,
    includeWorkingDirectory: true,
    includeGitMetadata: false,
    shareSecretLookingInput: false
  });
  await store.reset();
  t.is(await store.load(), null);
});

test('the original renderer input to Session.write call graph remains intact', (t) => {
  const rendererActions = readFileSync(projectPath('lib', 'actions', 'sessions.ts'), 'utf8');
  const mainWindow = readFileSync(projectPath('app', 'ui', 'window.ts'), 'utf8');
  const session = readFileSync(projectPath('app', 'session.ts'), 'utf8');

  t.regex(rendererActions, /rpc\.emit\('data', \{uid: targetUid, data, escaped\}\)/);
  t.regex(mainWindow, /rpc\.on\('data',[\s\S]*?session\.write\(data\)/);
  t.regex(session, /write\(data: string\)[\s\S]*?this\.pty\.write\(data\)/);
});
