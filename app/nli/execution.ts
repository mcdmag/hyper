import type {NliApprovalRequest, NliErrorCode, SessionUid} from '../../typings/nli';

import type {NliApprovalDecision, NliApprovalIdentity} from './command-plan';

export interface ApprovedCommandSession {
  readonly ended: boolean;
  isWritable(): boolean;
  write(data: string): void;
}

export interface NliApprovalExecutor {
  approve(request: NliApprovalRequest, identity: NliApprovalIdentity): NliApprovalDecision;
  tagGeneratedWrite(sessionUid: SessionUid, submittedLine: string): void;
  clearGeneratedWrite(sessionUid: SessionUid): void;
  completeApproval(request: NliApprovalRequest): boolean;
  failApproval(request: NliApprovalRequest, code: 'NLI_SESSION_CLOSED' | 'NLI_STALE' | 'NLI_WRITE_FAILED'): boolean;
}

export type ApprovedCommandExecutionResult =
  | {readonly status: 'rejected'}
  | {readonly status: 'confirmation-required'}
  | {readonly status: 'sent'}
  | {
      readonly status: 'not-sent';
      readonly code: Extract<NliErrorCode, 'NLI_SESSION_CLOSED' | 'NLI_STALE'>;
    }
  | {readonly status: 'unknown'; readonly code: 'NLI_WRITE_FAILED'};

export interface ExecuteApprovedCommandOptions {
  readonly request: NliApprovalRequest;
  readonly identity: NliApprovalIdentity;
  readonly service: NliApprovalExecutor;
  readonly getSession: (sessionUid: SessionUid) => ApprovedCommandSession | undefined;
  readonly isRendererCurrent: () => boolean;
  readonly restoreTerminalFocus: (sessionUid: SessionUid) => void;
}

/**
 * Consumes main-owned approval and performs exactly one synchronous write. Keep this
 * function synchronous: there must never be an await or retry between authorization
 * and the original PTY write.
 */
export const executeApprovedCommand = (options: ExecuteApprovedCommandOptions): ApprovedCommandExecutionResult => {
  if (!options.isRendererCurrent()) return {status: 'rejected'};

  const decision = options.service.approve(options.request, options.identity);
  if (decision.status === 'rejected') return {status: 'rejected'};
  if (decision.status === 'confirmation-required') return {status: 'confirmation-required'};

  if (!options.isRendererCurrent()) {
    options.service.failApproval(options.request, 'NLI_STALE');
    return {status: 'not-sent', code: 'NLI_STALE'};
  }

  const session = options.getSession(decision.sessionUid);
  if (!session || session.ended || !session.isWritable()) {
    options.service.failApproval(options.request, 'NLI_SESSION_CLOSED');
    options.restoreTerminalFocus(decision.sessionUid);
    return {status: 'not-sent', code: 'NLI_SESSION_CLOSED'};
  }

  options.service.tagGeneratedWrite(decision.sessionUid, decision.shellText);
  try {
    session.write(`${decision.shellText}\r`);
  } catch (_error) {
    options.service.clearGeneratedWrite(decision.sessionUid);
    options.service.failApproval(options.request, 'NLI_WRITE_FAILED');
    options.restoreTerminalFocus(decision.sessionUid);
    return {status: 'unknown', code: 'NLI_WRITE_FAILED'};
  }

  options.service.completeApproval(options.request);
  options.restoreTerminalFocus(decision.sessionUid);
  return {status: 'sent'};
};
