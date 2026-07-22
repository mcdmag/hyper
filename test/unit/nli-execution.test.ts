import {readFileSync} from 'fs';
import {join} from 'path';

import test from 'ava';

import type {NliApprovalDecision, NliApprovalIdentity} from '../../app/nli/command-plan';
import {executeApprovedCommand, type ApprovedCommandSession, type NliApprovalExecutor} from '../../app/nli/execution';
import type {AttemptId, NliApprovalRequest, OptionId, PlanId, SessionUid} from '../../typings/nli';

const sessionUid = 'session-1' as SessionUid;
const request: NliApprovalRequest = Object.freeze({
  sessionUid,
  attemptId: 'attempt-1' as AttemptId,
  planId: 'plan-1' as PlanId,
  optionId: 'option-1' as OptionId,
  editRevision: 0,
  highRiskConfirmation: false
});
const identity: NliApprovalIdentity = Object.freeze({windowId: 10, rendererId: 20});
const authoritativeText = 'git status; gh pr create --draft';

const authorizedDecision = (): Extract<NliApprovalDecision, {status: 'authorized'}> => ({
  status: 'authorized',
  sessionUid,
  attemptId: request.attemptId,
  planId: request.planId,
  optionId: request.optionId,
  editRevision: request.editRevision,
  shellText: authoritativeText,
  digest: 'main-owned-digest',
  risk: {level: 'medium', reasons: ['Remote state.'], requiresSecondConfirmation: false}
});

const makeHarness = (decision: NliApprovalDecision = authorizedDecision()) => {
  const trace: string[] = [];
  const writes: string[] = [];
  let consumed = false;
  const service: NliApprovalExecutor = {
    approve(_request, actualIdentity) {
      trace.push(`approve:${actualIdentity.windowId}:${actualIdentity.rendererId}`);
      if (consumed) return {status: 'rejected'};
      if (decision.status === 'authorized') consumed = true;
      return decision;
    },
    tagGeneratedWrite(uid, submittedLine) {
      trace.push(`tag:${uid}:${submittedLine}`);
    },
    clearGeneratedWrite(uid) {
      trace.push(`clear:${uid}`);
    },
    completeApproval() {
      trace.push('complete');
      return true;
    },
    failApproval(_request, code) {
      trace.push(`fail:${code}`);
      return true;
    }
  };
  const session: ApprovedCommandSession = {
    ended: false,
    isWritable() {
      trace.push('writable');
      return true;
    },
    write(data) {
      trace.push('write');
      writes.push(data);
    }
  };
  const execute = (overrides: Partial<Parameters<typeof executeApprovedCommand>[0]> = {}) =>
    executeApprovedCommand({
      request,
      identity,
      service,
      getSession() {
        trace.push('session');
        return session;
      },
      isRendererCurrent() {
        trace.push('renderer');
        return true;
      },
      restoreTerminalFocus(uid) {
        trace.push(`focus:${uid}`);
      },
      ...overrides
    });
  return {execute, service, session, trace, writes};
};

test('approved main-owned bytes plus PowerShell Enter are written synchronously exactly once', (t) => {
  const harness = makeHarness();

  t.deepEqual(harness.execute(), {status: 'sent'});
  t.deepEqual(harness.writes, [`${authoritativeText}\r`]);
  t.deepEqual(harness.trace, [
    'renderer',
    'approve:10:20',
    'renderer',
    'session',
    'writable',
    `tag:${sessionUid}:${authoritativeText}`,
    'write',
    'complete',
    `focus:${sessionUid}`
  ]);
  t.false(executeApprovedCommand.toString().includes('await'));
});

test('renderer-added command text cannot replace immutable main-owned bytes', (t) => {
  const harness = makeHarness();
  const adversarialRequest = {...request, shellText: 'Remove-Item -Recurse C:\\'} as NliApprovalRequest;

  harness.execute({request: adversarialRequest});

  t.deepEqual(harness.writes, [`${authoritativeText}\r`]);
});

test('rejection, confirmation, stale renderer, and replay write zero additional bytes', (t) => {
  const rejected = makeHarness({status: 'rejected'});
  t.deepEqual(rejected.execute(), {status: 'rejected'});
  t.deepEqual(rejected.writes, []);

  const confirmation = makeHarness({
    status: 'confirmation-required',
    risk: {level: 'high', reasons: ['Deletion.'], requiresSecondConfirmation: true}
  });
  t.deepEqual(confirmation.execute(), {status: 'confirmation-required'});
  t.deepEqual(confirmation.writes, []);

  const stale = makeHarness();
  let checks = 0;
  t.deepEqual(
    stale.execute({
      isRendererCurrent: () => ++checks === 1
    }),
    {status: 'not-sent', code: 'NLI_STALE'}
  );
  t.deepEqual(stale.writes, []);
  t.true(stale.trace.includes('fail:NLI_STALE'));

  const replay = makeHarness();
  t.deepEqual(replay.execute(), {status: 'sent'});
  t.deepEqual(replay.execute(), {status: 'rejected'});
  t.deepEqual(replay.writes, [`${authoritativeText}\r`]);
});

test('a closed original PTY is reported as not sent and never written', (t) => {
  const harness = makeHarness();
  const closed: ApprovedCommandSession = {
    ended: true,
    isWritable: () => false,
    write: () => t.fail('closed PTY must not be written')
  };

  t.deepEqual(harness.execute({getSession: () => closed}), {
    status: 'not-sent',
    code: 'NLI_SESSION_CLOSED'
  });
  t.deepEqual(harness.writes, []);
  t.true(harness.trace.includes('fail:NLI_SESSION_CLOSED'));
  t.true(harness.trace.includes(`focus:${sessionUid}`));
});

test('a synchronous PTY error has an honest unknown outcome, clears suppression, and is never retried', (t) => {
  const harness = makeHarness();
  let attempts = 0;
  const throwing: ApprovedCommandSession = {
    ended: false,
    isWritable: () => true,
    write() {
      attempts++;
      throw new Error('conpty write failed');
    }
  };

  t.deepEqual(harness.execute({getSession: () => throwing}), {status: 'unknown', code: 'NLI_WRITE_FAILED'});
  t.deepEqual(harness.execute({getSession: () => throwing}), {status: 'rejected'});
  t.is(attempts, 1);
  t.true(harness.trace.includes(`clear:${sessionUid}`));
  t.true(harness.trace.includes('fail:NLI_WRITE_FAILED'));
});

test('main window binds approval to the actual IPC sender and keeps legacy terminal writes unchanged', (t) => {
  const mainWindow = readFileSync(join(__dirname, '..', '..', 'app', 'ui', 'window.ts'), 'utf8');
  const execution = readFileSync(join(__dirname, '..', '..', 'app', 'nli', 'execution.ts'), 'utf8');

  t.regex(mainWindow, /onWithEvent\(NLI_RPC_EVENTS\.approve/);
  t.regex(mainWindow, /event\.sender === window\.webContents/);
  t.regex(mainWindow, /identity: \{windowId: window\.id, rendererId: event\.sender\.id\}/);
  t.regex(mainWindow, /rpc\.on\('data',[\s\S]*?session\.write\(data\)/);
  t.false(/\b(?:exec|execFile)\s*\(/.test(execution));
});
