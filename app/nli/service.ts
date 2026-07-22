import {posix, win32} from 'path';

import type {
  AttemptId,
  NliAttempt,
  NliAttemptRequest,
  NliClock,
  NliDiagnostic,
  NliDisplayOption,
  NliDisplayState,
  NliErrorCode,
  NliGitMetadata,
  NliLifecycleStatus,
  NliNonceSource,
  NliPrivacyPreferences,
  NliProvider,
  NliProviderResult,
  NliSessionSnapshot,
  SessionUid,
  ShellSemanticEvent
} from '../../typings/nli';

import {fingerprintWorkingDirectory} from './osc-parser';
import type {NliPreferencesStore} from './preferences';

const TERMINAL_STATES = new Set<NliLifecycleStatus>(['sent', 'cancelled', 'error', 'stale']);

const LEGAL_TRANSITIONS: Readonly<Record<NliLifecycleStatus, readonly NliLifecycleStatus[]>> = Object.freeze({
  idle: ['detected'],
  detected: ['privacy-required', 'auth-required', 'interpreting', 'cancelled', 'error', 'stale'],
  'privacy-required': ['auth-required', 'interpreting', 'cancelled', 'error', 'stale'],
  'auth-required': ['interpreting', 'cancelled', 'error', 'stale'],
  interpreting: ['review', 'clarification', 'auth-required', 'cancelled', 'error', 'stale'],
  review: ['approving', 'interpreting', 'cancelled', 'error', 'stale'],
  clarification: ['interpreting', 'cancelled', 'error', 'stale'],
  approving: ['sent', 'error', 'stale'],
  sent: [],
  cancelled: [],
  error: [],
  stale: []
});

const ERROR_MESSAGES: Readonly<Record<NliErrorCode, string>> = Object.freeze({
  NLI_AUTH_REQUIRED: 'Sign in with ChatGPT to ask Codex for command options.',
  NLI_CANCELLED: 'Natural-language assistance was cancelled.',
  NLI_CODEX_INCOMPATIBLE: 'This Codex installation is not compatible with Hyper assistance.',
  NLI_KEYRING_UNAVAILABLE: 'Secure credential storage is unavailable.',
  NLI_OFFLINE: 'Codex could not be reached. Check the connection and try again.',
  NLI_PRIVACY_REQUIRED: 'Review the privacy notice before sharing this failed command.',
  NLI_PROVIDER_FAILED: 'Codex could not prepare command options.',
  NLI_STALE: 'The terminal context changed. Run the request again.',
  NLI_TIMEOUT: 'Codex took too long to respond.',
  NLI_UNSUPPORTED_SHELL: 'Automatic assistance is available only in supported PowerShell sessions.',
  NLI_VALIDATION_FAILED: 'Codex returned a response Hyper could not safely use.'
});

interface ServiceAttempt {
  readonly attempt: NliAttempt;
  readonly event: ShellSemanticEvent;
  readonly abortController: AbortController;
  readonly shellIdentity: string;
  status: NliLifecycleStatus;
  inFlight: boolean;
}

export interface NliServiceOptions {
  readonly windowUid: string;
  readonly enabled: () => boolean;
  readonly preferences: NliPreferencesStore;
  readonly providerFactory: () => NliProvider;
  readonly clock: NliClock;
  readonly nonceSource: NliNonceSource;
  readonly emitState: (state: NliDisplayState) => void;
  readonly getSessionSnapshot: (sessionUid: SessionUid) => NliSessionSnapshot | undefined;
  readonly collectGitMetadata?: (workingDirectory: string, signal: AbortSignal) => Promise<NliGitMetadata>;
  readonly emitDiagnostic?: (diagnostic: NliDiagnostic) => void;
  readonly operatingSystem?: NodeJS.Platform;
  readonly includeWorkingDirectory: () => boolean;
  readonly includeGitMetadata: () => boolean;
  readonly maxOptions: () => number;
}

const isNliErrorCode = (value: unknown): value is NliErrorCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, value);

const freezeDisplayOption = (option: NliDisplayOption): NliDisplayOption =>
  Object.freeze({...option, risk: Object.freeze({...option.risk, reasons: Object.freeze([...option.risk.reasons])})});

export const canTransitionNliState = (from: NliLifecycleStatus, to: NliLifecycleStatus) =>
  LEGAL_TRANSITIONS[from].includes(to);

const isPowerShell = (shell: string | null): shell is string =>
  typeof shell === 'string' && /(?:^|[\\/])(?:powershell|pwsh)(?:\.exe)?$/i.test(shell);

const normalizeShellIdentity = (shell: string, platform: NodeJS.Platform) =>
  platform === 'win32' ? win32.normalize(shell).toLocaleLowerCase('en-US') : posix.normalize(shell);

export class NliService {
  private readonly options: NliServiceOptions;
  private readonly attempts = new Map<SessionUid, ServiceAttempt>();
  private readonly callbacks = new Map<string, number>();
  private readonly identities = new Map<string, number>();
  private readonly generatedAttempts = new Map<
    SessionUid,
    {readonly submittedLine: string; readonly expiresAt: number}
  >();
  private provider: NliProvider | null = null;
  private disposed = false;

  constructor(options: NliServiceOptions) {
    this.options = options;
  }

  onCommandNotFound(event: ShellSemanticEvent): void {
    if (this.disposed || !this.options.enabled() || event.windowUid !== this.options.windowUid) {
      return;
    }
    const snapshot = this.options.getSessionSnapshot(event.sessionUid);
    if (!snapshot || !isPowerShell(snapshot.shell) || this.consumeGeneratedAttempt(event) || this.isDuplicate(event)) {
      return;
    }

    this.startAttempt(event, normalizeShellIdentity(snapshot.shell, this.platform));
  }

  onUserInput(sessionUid: SessionUid): void {
    const attempt = this.attempts.get(sessionUid);
    if (attempt && !TERMINAL_STATES.has(attempt.status)) {
      this.finish(attempt, 'stale', 'NLI_STALE');
    }
  }

  tagGeneratedWrite(sessionUid: SessionUid, submittedLine: string): void {
    this.generatedAttempts.set(sessionUid, {
      submittedLine,
      expiresAt: this.options.clock.now() + 30000
    });
  }

  private startAttempt(event: ShellSemanticEvent, shellIdentity: string): void {
    const prior = this.attempts.get(event.sessionUid);
    if (prior && !TERMINAL_STATES.has(prior.status)) {
      this.finish(prior, 'stale', 'NLI_STALE');
    }

    const attempt: ServiceAttempt = {
      attempt: Object.freeze({
        attemptId: this.options.nonceSource.create(16) as AttemptId,
        sessionUid: event.sessionUid,
        callbackId: event.callbackId,
        cwdFingerprint: event.cwdFingerprint,
        createdAt: this.options.clock.now()
      }),
      event: Object.freeze({...event}),
      abortController: new AbortController(),
      shellIdentity,
      status: 'detected',
      inFlight: false
    };
    this.attempts.set(event.sessionUid, attempt);
    void this.advance(attempt);
  }

  async setPrivacyPreferences(
    preferences: Omit<NliPrivacyPreferences, 'privacyNoticeVersion'>
  ): Promise<NliPrivacyPreferences> {
    const saved = await this.options.preferences.save(preferences);
    for (const attempt of this.attempts.values()) {
      if (attempt.status === 'privacy-required') {
        void this.continueAfterPrivacy(attempt, saved);
      }
    }
    return saved;
  }

  async resetPrivacyPreferences(): Promise<void> {
    await this.options.preferences.reset();
    for (const attempt of this.attempts.values()) {
      if (!TERMINAL_STATES.has(attempt.status)) {
        this.finish(attempt, 'cancelled', 'NLI_CANCELLED');
      }
    }
  }

  async login(sessionUid: SessionUid): Promise<void> {
    const attempt = this.attempts.get(sessionUid);
    if (!attempt || attempt.status !== 'auth-required' || attempt.inFlight || !this.isCurrent(attempt)) {
      return;
    }
    attempt.inFlight = true;
    try {
      const auth = await this.getProvider().login(attempt.abortController.signal);
      if (!this.isCurrent(attempt)) return;
      if (auth.status === 'signed-in') {
        this.transition(attempt, 'interpreting');
        this.options.emitState({
          status: 'interpreting',
          sessionUid: attempt.attempt.sessionUid,
          attemptId: attempt.attempt.attemptId
        });
        await this.interpret(attempt, await this.options.preferences.load());
      } else if (auth.status === 'signed-out' || auth.status === 'unknown' || auth.status === 'signing-in') {
        this.emitAuthRequired(attempt);
      } else {
        this.finish(attempt, 'error', auth.code);
      }
    } catch (error) {
      this.handleError(attempt, error);
    } finally {
      attempt.inFlight = false;
    }
  }

  async logout(): Promise<void> {
    for (const attempt of this.attempts.values()) {
      if (!TERMINAL_STATES.has(attempt.status)) {
        this.finish(attempt, 'cancelled', 'NLI_CANCELLED');
      }
    }
    if (this.provider) {
      await this.provider.logout();
    }
  }

  cancel(request: NliAttemptRequest): void {
    const attempt = this.match(request);
    if (attempt && !TERMINAL_STATES.has(attempt.status)) {
      this.finish(attempt, 'cancelled', 'NLI_CANCELLED');
    }
  }

  retry(request: NliAttemptRequest): void {
    const prior = this.match(request);
    if (!this.options.enabled() || !prior || (prior.status !== 'error' && prior.status !== 'cancelled')) {
      return;
    }
    this.attempts.delete(request.sessionUid);
    this.startAttempt(
      {
        ...prior.event,
        callbackId: this.options.nonceSource.create(16) as ShellSemanticEvent['callbackId']
      },
      prior.shellIdentity
    );
  }

  isCurrentContext(request: NliAttemptRequest): boolean {
    const attempt = this.match(request);
    if (!attempt || TERMINAL_STATES.has(attempt.status)) return false;
    return this.isSnapshotCurrent(attempt, this.options.getSessionSnapshot(request.sessionUid));
  }

  disposeSession(sessionUid: SessionUid): void {
    const attempt = this.attempts.get(sessionUid);
    if (attempt && !TERMINAL_STATES.has(attempt.status)) {
      this.finish(attempt, 'stale', 'NLI_STALE');
    }
    this.attempts.delete(sessionUid);
    this.generatedAttempts.delete(sessionUid);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) return;
    for (const attempt of this.attempts.values()) {
      if (!TERMINAL_STATES.has(attempt.status)) {
        this.finish(attempt, 'cancelled', 'NLI_CANCELLED');
      }
    }
    if (this.provider) {
      const provider = this.provider;
      this.provider = null;
      await provider.dispose();
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    const disabling = this.setEnabled(false);
    this.disposed = true;
    await disabling;
    this.attempts.clear();
    this.callbacks.clear();
    this.identities.clear();
    this.generatedAttempts.clear();
  }

  private async advance(attempt: ServiceAttempt): Promise<void> {
    try {
      const preferences = await this.options.preferences.load();
      if (!this.isCurrent(attempt)) return;
      if (!preferences) {
        this.transition(attempt, 'privacy-required');
        this.options.emitState({
          status: 'privacy-required',
          sessionUid: attempt.attempt.sessionUid,
          attemptId: attempt.attempt.attemptId
        });
        return;
      }
      await this.continueAfterPrivacy(attempt, preferences);
    } catch (error) {
      this.handleError(attempt, error);
    }
  }

  private async continueAfterPrivacy(attempt: ServiceAttempt, preferences: NliPrivacyPreferences): Promise<void> {
    if (!this.isCurrent(attempt) || attempt.inFlight) return;
    attempt.inFlight = true;
    try {
      if (!this.isSnapshotCurrent(attempt, this.options.getSessionSnapshot(attempt.attempt.sessionUid))) {
        this.finish(attempt, 'stale', 'NLI_STALE');
        return;
      }
      const auth = await this.getProvider().getAuthStatus(attempt.abortController.signal);
      if (!this.isCurrent(attempt)) return;
      if (auth.status !== 'signed-in') {
        if (auth.status === 'error') {
          this.finish(attempt, 'error', auth.code);
        } else {
          this.transition(attempt, 'auth-required');
          this.emitAuthRequired(attempt);
        }
        return;
      }
      this.transition(attempt, 'interpreting');
      this.options.emitState({
        status: 'interpreting',
        sessionUid: attempt.attempt.sessionUid,
        attemptId: attempt.attempt.attemptId
      });
      await this.interpret(attempt, preferences);
    } catch (error) {
      this.handleError(attempt, error);
    } finally {
      attempt.inFlight = false;
    }
  }

  private async interpret(attempt: ServiceAttempt, preferences: NliPrivacyPreferences | null): Promise<void> {
    if (!preferences || !this.isCurrent(attempt)) return;
    const snapshot = this.options.getSessionSnapshot(attempt.attempt.sessionUid);
    if (!this.isSnapshotCurrent(attempt, snapshot)) {
      this.finish(attempt, 'stale', 'NLI_STALE');
      return;
    }
    let currentWorkingDirectory: string | undefined;
    if (snapshot?.workingDirectory) {
      const fingerprint = fingerprintWorkingDirectory(
        snapshot.workingDirectory,
        attempt.event.providerName,
        this.options.operatingSystem
      );
      if (fingerprint !== attempt.event.cwdFingerprint) {
        this.finish(attempt, 'stale', 'NLI_STALE');
        return;
      }
      currentWorkingDirectory = snapshot.workingDirectory;
    }

    let git: NliGitMetadata | undefined;
    if (
      preferences.includeGitMetadata &&
      this.options.includeGitMetadata() &&
      currentWorkingDirectory &&
      this.options.collectGitMetadata
    ) {
      git = await this.options.collectGitMetadata(currentWorkingDirectory, attempt.abortController.signal);
      if (!this.isCurrent(attempt)) return;
      if (!this.isSnapshotCurrent(attempt, this.options.getSessionSnapshot(attempt.attempt.sessionUid))) {
        this.finish(attempt, 'stale', 'NLI_STALE');
        return;
      }
    }

    const result = await this.getProvider().interpret(
      Object.freeze({
        attemptId: attempt.attempt.attemptId,
        submittedLine: attempt.event.submittedLine,
        shellFamily: attempt.event.shellFamily,
        shellVersion: attempt.event.shellVersion,
        operatingSystem: this.options.operatingSystem || process.platform,
        cwdFingerprint: attempt.event.cwdFingerprint,
        ...(preferences.includeWorkingDirectory && this.options.includeWorkingDirectory() && currentWorkingDirectory
          ? {workingDirectory: currentWorkingDirectory}
          : {}),
        ...(git ? {git} : {})
      }),
      attempt.abortController.signal
    );
    if (!this.isCurrent(attempt)) return;
    this.emitProviderResult(attempt, result);
  }

  private emitProviderResult(attempt: ServiceAttempt, result: NliProviderResult): void {
    if (result.kind === 'clarification') {
      this.transition(attempt, 'clarification');
      this.options.emitState({
        status: 'clarification',
        sessionUid: attempt.attempt.sessionUid,
        attemptId: attempt.attempt.attemptId,
        planId: result.planId,
        question: result.question,
        choices: Object.freeze(result.choices.map((choice) => Object.freeze({...choice})))
      });
      return;
    }

    this.transition(attempt, 'review');
    const limit = Math.max(1, Math.min(3, this.options.maxOptions()));
    const options = result.options.slice(0, limit).map((option) =>
      freezeDisplayOption({
        optionId: option.optionId,
        label: option.label,
        explanation: option.explanation,
        commandPreview: option.shellText,
        risk: {
          level: 'medium',
          reasons: ['Review the generated command before running it.'],
          requiresSecondConfirmation: false
        }
      })
    );
    this.options.emitState({
      status: 'review',
      sessionUid: attempt.attempt.sessionUid,
      attemptId: attempt.attempt.attemptId,
      planId: result.planId,
      summary: result.summary,
      options: Object.freeze(options),
      editRevision: 0
    });
  }

  private emitAuthRequired(attempt: ServiceAttempt): void {
    this.options.emitState({
      status: 'auth-required',
      sessionUid: attempt.attempt.sessionUid,
      attemptId: attempt.attempt.attemptId
    });
  }

  private getProvider(): NliProvider {
    if (!this.provider) {
      this.provider = this.options.providerFactory();
    }
    return this.provider;
  }

  private transition(attempt: ServiceAttempt, next: NliLifecycleStatus): void {
    if (attempt.status === next) return;
    if (!canTransitionNliState(attempt.status, next)) {
      throw Object.assign(new Error('Illegal natural-language lifecycle transition'), {
        code: 'NLI_VALIDATION_FAILED' satisfies NliErrorCode
      });
    }
    attempt.status = next;
  }

  private finish(attempt: ServiceAttempt, status: 'cancelled' | 'error' | 'stale', code: NliErrorCode): void {
    if (!this.isCurrent(attempt) || TERMINAL_STATES.has(attempt.status)) return;
    this.transition(attempt, status);
    attempt.abortController.abort();
    const correlationId = this.options.nonceSource.create(12);
    const base = {
      sessionUid: attempt.attempt.sessionUid,
      attemptId: attempt.attempt.attemptId,
      correlationId,
      message: ERROR_MESSAGES[code]
    };
    if (status === 'cancelled') {
      this.options.emitState({...base, status: 'cancelled', code: 'NLI_CANCELLED'});
    } else {
      this.options.emitState({...base, status, code});
    }
    if (status === 'error') {
      this.options.emitDiagnostic?.({severity: 'error', code, component: 'service', correlationId});
    }
  }

  private handleError(attempt: ServiceAttempt, error: unknown): void {
    if (!this.isCurrent(attempt) || TERMINAL_STATES.has(attempt.status)) return;
    const code =
      error instanceof Error && isNliErrorCode((error as Error & {code?: unknown}).code)
        ? (error as Error & {code: NliErrorCode}).code
        : attempt.abortController.signal.aborted
          ? 'NLI_CANCELLED'
          : 'NLI_PROVIDER_FAILED';
    this.finish(attempt, code === 'NLI_CANCELLED' ? 'cancelled' : code === 'NLI_STALE' ? 'stale' : 'error', code);
  }

  private match(request: NliAttemptRequest): ServiceAttempt | undefined {
    const attempt = this.attempts.get(request.sessionUid);
    return attempt?.attempt.attemptId === request.attemptId ? attempt : undefined;
  }

  private isCurrent(attempt: ServiceAttempt): boolean {
    return (
      !this.disposed &&
      !TERMINAL_STATES.has(attempt.status) &&
      this.attempts.get(attempt.attempt.sessionUid) === attempt
    );
  }

  private isDuplicate(event: ShellSemanticEvent): boolean {
    const now = this.options.clock.now();
    const callbackIdentity = `${event.sessionUid}\u0000${event.callbackId}`;
    if (this.callbacks.has(callbackIdentity)) return true;
    this.callbacks.set(callbackIdentity, now);
    const identity = event.historyId
      ? `${event.sessionUid}\u0000history:${event.historyId}\u0000${event.submittedLine}`
      : `${event.sessionUid}\u0000line:${event.submittedLine}`;
    const prior = this.identities.get(identity);
    this.identities.set(identity, now);
    this.pruneDedupe(now);
    return prior !== undefined && (event.historyId !== undefined || now - prior <= 100);
  }

  private consumeGeneratedAttempt(event: ShellSemanticEvent): boolean {
    const generated = this.generatedAttempts.get(event.sessionUid);
    if (!generated) return false;
    if (generated.expiresAt < this.options.clock.now()) {
      this.generatedAttempts.delete(event.sessionUid);
      return false;
    }
    if (generated.submittedLine !== event.submittedLine) return false;
    this.generatedAttempts.delete(event.sessionUid);
    return true;
  }

  private pruneDedupe(now: number): void {
    for (const [key, timestamp] of this.callbacks) {
      if (this.callbacks.size <= 512 && now - timestamp <= 60000) break;
      this.callbacks.delete(key);
    }
    for (const [key, timestamp] of this.identities) {
      if (this.identities.size <= 512 && now - timestamp <= 60000) break;
      this.identities.delete(key);
    }
  }

  private isSnapshotCurrent(attempt: ServiceAttempt, snapshot: NliSessionSnapshot | undefined): boolean {
    if (
      !snapshot?.workingDirectory ||
      !isPowerShell(snapshot.shell) ||
      normalizeShellIdentity(snapshot.shell, this.platform) !== attempt.shellIdentity
    ) {
      return false;
    }
    return (
      fingerprintWorkingDirectory(snapshot.workingDirectory, attempt.event.providerName, this.platform) ===
      attempt.event.cwdFingerprint
    );
  }

  private get platform(): NodeJS.Platform {
    return this.options.operatingSystem || process.platform;
  }
}
