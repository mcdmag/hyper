import type {ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio} from 'child_process';

declare const nliIdBrand: unique symbol;

export type BrandedId<Name extends string> = string & {
  readonly [nliIdBrand]: Name;
};

export type SessionUid = BrandedId<'SessionUid'>;
export type AttemptId = BrandedId<'AttemptId'>;
export type PlanId = BrandedId<'PlanId'>;
export type OptionId = BrandedId<'OptionId'>;
export type CallbackId = BrandedId<'CallbackId'>;

export type ShellFamily = 'powershell';
export type NliRiskLevel = 'low' | 'medium' | 'high';

export type NliErrorCode =
  | 'NLI_AUTH_REQUIRED'
  | 'NLI_CANCELLED'
  | 'NLI_CODEX_CRASHED'
  | 'NLI_CODEX_INCOMPATIBLE'
  | 'NLI_CODEX_MISSING'
  | 'NLI_KEYRING_UNAVAILABLE'
  | 'NLI_OFFLINE'
  | 'NLI_PRIVACY_REQUIRED'
  | 'NLI_PROVIDER_FAILED'
  | 'NLI_RATE_LIMIT'
  | 'NLI_STALE'
  | 'NLI_TIMEOUT'
  | 'NLI_UNSUPPORTED_SHELL'
  | 'NLI_USERDATA_UNWRITABLE'
  | 'NLI_VALIDATION_FAILED';

export interface ShellSemanticEvent {
  readonly windowUid: string;
  readonly sessionUid: SessionUid;
  readonly callbackId: CallbackId;
  readonly reason: 'command-not-found';
  readonly submittedLine: string;
  readonly shellFamily: ShellFamily;
  readonly shellVersion: string;
  readonly historyId?: string;
  readonly providerName: string;
  readonly cwdFingerprint: string;
  readonly workingDirectory?: string;
}

export interface NliAttempt {
  readonly attemptId: AttemptId;
  readonly sessionUid: SessionUid;
  readonly callbackId: CallbackId;
  readonly cwdFingerprint: string;
  readonly createdAt: number;
}

export type NliAuthState =
  | {readonly status: 'unknown'}
  | {readonly status: 'signed-out'}
  | {readonly status: 'signing-in'; readonly verificationUrl?: string}
  | {readonly status: 'signed-in'; readonly accountLabel?: string}
  | {
      readonly status: 'error';
      readonly code: NliErrorCode;
      readonly correlationId: string;
    };

export interface NliPrivacyPreferences {
  readonly privacyNoticeVersion: 1;
  readonly includeWorkingDirectory: boolean;
  readonly includeGitMetadata: boolean;
}

export type NliPrivacyState =
  | {readonly status: 'consent-required'}
  | {
      readonly status: 'accepted';
      readonly preferences: NliPrivacyPreferences;
    };

export interface NliGitMetadata {
  readonly isRepository: boolean;
  readonly branch?: string;
  readonly hasStaged: boolean;
  readonly hasUnstaged: boolean;
  readonly hasUntracked: boolean;
  readonly hasRemote: boolean;
  readonly ghAvailable: boolean;
}

export interface NliInterpretationContext {
  readonly attemptId: AttemptId;
  readonly submittedLine: string;
  readonly shellFamily: ShellFamily;
  readonly shellVersion: string;
  readonly operatingSystem: NodeJS.Platform;
  readonly cwdFingerprint: string;
  readonly workingDirectory?: string;
  readonly git?: NliGitMetadata;
}

export interface CommandPlanOption {
  readonly optionId: OptionId;
  readonly label: string;
  readonly explanation: string;
  /** Authoritative bytes. This type is main-process only and must never cross renderer IPC. */
  readonly shellText: string;
}

export interface CommandPlan {
  readonly kind: 'plan';
  readonly planId: PlanId;
  readonly summary: string;
  readonly options: readonly CommandPlanOption[];
}

export interface ClarificationPlan {
  readonly kind: 'clarification';
  readonly planId: PlanId;
  readonly question: string;
  readonly choices: readonly {
    readonly optionId: OptionId;
    readonly label: string;
  }[];
}

export type NliProviderResult = CommandPlan | ClarificationPlan;

export interface LocalRiskAssessment {
  readonly level: NliRiskLevel;
  readonly reasons: readonly string[];
  readonly requiresSecondConfirmation: boolean;
}

export interface NliDisplayOption {
  readonly optionId: OptionId;
  readonly label: string;
  readonly explanation: string;
  /** Display-only copy. Main retains the authoritative bytes and digest. */
  readonly commandPreview: string;
  readonly risk: LocalRiskAssessment;
}

export type NliDisplayState =
  | {readonly status: 'idle'; readonly sessionUid: SessionUid}
  | {
      readonly status: 'unsupported';
      readonly sessionUid: SessionUid;
      readonly message: string;
    }
  | {
      readonly status: 'privacy-required';
      readonly sessionUid: SessionUid;
      readonly attemptId: AttemptId;
    }
  | {
      readonly status: 'auth-required';
      readonly sessionUid: SessionUid;
      readonly attemptId: AttemptId;
    }
  | {
      readonly status: 'interpreting';
      readonly sessionUid: SessionUid;
      readonly attemptId: AttemptId;
    }
  | {
      readonly status: 'review';
      readonly sessionUid: SessionUid;
      readonly attemptId: AttemptId;
      readonly planId: PlanId;
      readonly summary: string;
      readonly options: readonly NliDisplayOption[];
      readonly editRevision: number;
    }
  | {
      readonly status: 'clarification';
      readonly sessionUid: SessionUid;
      readonly attemptId: AttemptId;
      readonly planId: PlanId;
      readonly question: string;
      readonly choices: readonly {
        readonly optionId: OptionId;
        readonly label: string;
      }[];
    }
  | {
      readonly status: 'sent';
      readonly sessionUid: SessionUid;
      readonly attemptId: AttemptId;
    }
  | {
      readonly status: 'cancelled';
      readonly sessionUid: SessionUid;
      readonly attemptId: AttemptId;
      readonly code: 'NLI_CANCELLED';
      readonly correlationId: string;
      readonly message: string;
    }
  | {
      readonly status: 'error' | 'stale';
      readonly sessionUid: SessionUid;
      readonly attemptId?: AttemptId;
      readonly code: NliErrorCode;
      readonly correlationId: string;
      readonly message: string;
    };

/** Opaque authorization only. Command text is deliberately impossible to include here. */
export interface NliApprovalRequest {
  readonly windowId: number;
  readonly rendererId: number;
  readonly sessionUid: SessionUid;
  readonly attemptId: AttemptId;
  readonly planId: PlanId;
  readonly optionId: OptionId;
  readonly editRevision: number;
  readonly highRiskConfirmation: boolean;
}

export interface NliEditRequest {
  readonly sessionUid: SessionUid;
  readonly attemptId: AttemptId;
  readonly planId: PlanId;
  readonly optionId: OptionId;
  readonly editRevision: number;
  readonly shellText: string;
}

export interface NliPlanRequest {
  readonly sessionUid: SessionUid;
  readonly attemptId: AttemptId;
  readonly planId: PlanId;
}

export interface NliAttemptRequest {
  readonly sessionUid: SessionUid;
  readonly attemptId: AttemptId;
}

export interface NliClarificationRequest extends NliPlanRequest {
  readonly optionId: OptionId;
}

export interface PreparedShellIntegration {
  readonly shell: string;
  readonly args: readonly string[];
  readonly dispose: () => void | Promise<void>;
}

export interface PowerShellIntegrationOptions {
  readonly sessionUid: string;
  readonly nonce: string;
  readonly scriptDirectory: string;
  readonly windowUid?: string;
  readonly maxInputChars?: number;
}

export interface PowerShellIntegration {
  readonly scriptPath: string;
  readonly dispose: () => void;
}

export type ShellIntegrationDecision =
  | {
      readonly supported: false;
      readonly reason: string;
      readonly shell: string;
      readonly args: readonly string[];
    }
  | {
      readonly supported: true;
      readonly shell: string;
      readonly args: readonly string[];
      readonly family: ShellFamily;
    };

export type SupportedShellIntegrationDecision = Extract<ShellIntegrationDecision, {readonly supported: true}>;

export interface ShellIntegrationAdapter {
  readonly family: ShellFamily;
  detect(shell: string, args: readonly string[], enabled: boolean): ShellIntegrationDecision;
  prepare(sessionUid: SessionUid, decision: SupportedShellIntegrationDecision): PreparedShellIntegration;
}

export interface NliProvider {
  getAuthStatus(signal?: AbortSignal): Promise<NliAuthState>;
  login(signal?: AbortSignal): Promise<NliAuthState>;
  cancelLogin(): Promise<void>;
  logout(): Promise<void>;
  interpret(context: NliInterpretationContext, signal: AbortSignal): Promise<NliProviderResult>;
  dispose(): Promise<void>;
}

export interface NliClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface NliChildProcessFactory {
  spawn(
    executable: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio & {readonly stdio: 'pipe'}
  ): ChildProcessWithoutNullStreams;
}

export interface NliNonceSource {
  create(bytes?: number): string;
}

export interface NliDependencies {
  readonly clock: NliClock;
  readonly childProcessFactory: NliChildProcessFactory;
  readonly nonceSource: NliNonceSource;
  readonly providerFactory: () => NliProvider;
}

export type NliLifecycleStatus =
  | 'idle'
  | 'detected'
  | 'privacy-required'
  | 'auth-required'
  | 'interpreting'
  | 'review'
  | 'clarification'
  | 'approving'
  | 'sent'
  | 'cancelled'
  | 'error'
  | 'stale';

export interface NliSessionSnapshot {
  readonly shell: string | null;
  readonly workingDirectory?: string;
}

export interface NliDiagnostic {
  readonly severity: 'warning' | 'error';
  readonly code: NliErrorCode;
  readonly component: 'service';
  readonly correlationId: string;
}
