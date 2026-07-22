import React, {useEffect, useMemo, useRef, useState} from 'react';

import type {
  NliDisplayState,
  NliPrivacyPreferences,
  NliRendererSessionState,
  OptionId,
  SessionUid
} from '../../typings/nli';

export const NLI_CONFIG_BLOCK = `naturalLanguageInterface: {
  enabled: true,
  codexExecutable: 'codex',
  requestTimeoutMs: 30000,
  maxInputChars: 4096,
  maxOptions: 3,
  includeWorkingDirectory: false,
  includeGitMetadata: false
}`;

export interface NliPanelProps {
  readonly sessionUid: SessionUid;
  readonly shell: string | null;
  readonly enabled: boolean;
  readonly supportedShell: boolean;
  readonly active: boolean;
  readonly session?: NliRendererSessionState;
  readonly backgroundColor: string;
  readonly foregroundColor: string;
  readonly borderColor: string;
  readonly uiFontFamily: string;
  readonly onDismiss: () => void;
  readonly onOpenConfig: () => void;
  readonly onCheckStatus: () => void;
  readonly onPrivacy: (preferences: Omit<NliPrivacyPreferences, 'privacyNoticeVersion'>) => void;
  readonly onResetPrivacy: () => void;
  readonly onLogin: () => void;
  readonly onLogout: () => void;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly onClarify: (optionId: OptionId) => void;
  readonly onSelectOption: (optionId: OptionId) => void;
  readonly onBeginEdit: () => void;
  readonly onUpdateEdit: (value: string) => void;
  readonly onSaveEdit: () => void;
  readonly onCancelEdit: () => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onRestoreTerminalFocus: () => void;
}

const errorCopy = (display: Extract<NliDisplayState, {status: 'error' | 'stale'}>) => {
  switch (display.code) {
    case 'NLI_KEYRING_UNAVAILABLE':
      return {
        eyebrow: 'Codex sign-in',
        heading: 'The operating-system keyring is unavailable',
        body: 'Hyper will not fall back to plaintext credentials. Restore keyring access, then retry sign-in.'
      };
    case 'NLI_USERDATA_UNWRITABLE':
      return {
        eyebrow: 'Natural language setup',
        heading: 'Hyper cannot create its isolated Codex data directory',
        body: 'Check write access to Hyper userData. No credentials were stored and the terminal remains usable.'
      };
    case 'NLI_VALIDATION_FAILED':
      return {
        eyebrow: 'Suggestion rejected',
        heading: 'Codex returned an invalid command plan',
        body: "The response did not match Hyper's bounded schema. No model text or partial command can be approved."
      };
    case 'NLI_STALE':
      return {
        eyebrow: 'Approval expired',
        heading: 'The terminal context changed',
        body: 'The session, working directory, shell, selected option, or edit revision changed. The old approval cannot be replayed.'
      };
    case 'NLI_SESSION_CLOSED':
      return {
        eyebrow: 'Terminal closed',
        heading: 'The approved command was not sent',
        body: 'The original terminal session closed before Hyper could write to it. Nothing was retried.'
      };
    case 'NLI_GENERATED_COMMAND_FAILED':
      return {
        eyebrow: 'PowerShell command failed',
        heading: 'The approved command was not recognized',
        body: 'The original terminal output is the source of truth. Hyper will not invoke Codex again unless you choose Try again.'
      };
    case 'NLI_WRITE_FAILED':
      return {
        eyebrow: 'Terminal write outcome unknown',
        heading: 'Check the original terminal before continuing',
        body: 'Hyper made one synchronous write attempt, but cannot tell whether PowerShell received it. The command will not be retried.'
      };
    case 'NLI_OFFLINE':
    case 'NLI_RATE_LIMIT':
    case 'NLI_TIMEOUT':
      return {
        eyebrow: 'Codex unavailable',
        heading: 'No suggestion was created',
        body: 'Hyper could not reach Codex, or the account is temporarily rate limited. Nothing is queued to run.'
      };
    default:
      return {eyebrow: 'Natural language fallback', heading: 'No suggestion was created', body: display.message};
  }
};

const riskLabel = (level: 'low' | 'medium' | 'high') => `${level[0].toUpperCase()}${level.slice(1)} risk`;

const setupAuthErrorCopy = (code: Extract<NliRendererSessionState['auth'], {status: 'error'}>['code']) => {
  if (code === 'NLI_KEYRING_UNAVAILABLE') {
    return {
      heading: 'The operating-system keyring is unavailable',
      body: 'Hyper will not fall back to plaintext credentials. Restore keyring access, then retry sign-in.'
    };
  }
  if (code === 'NLI_USERDATA_UNWRITABLE') {
    return {
      heading: 'Hyper cannot create its isolated Codex data directory',
      body: 'Check write access to Hyper userData. No credentials were stored and the terminal remains usable.'
    };
  }
  return {heading: 'Codex is not ready', body: 'Check the Codex installation and connection, then try again.'};
};

const NliPanel = (props: NliPanelProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [privacy, setPrivacy] = useState({
    includeWorkingDirectory: false,
    includeGitMetadata: false,
    shareSecretLookingInput: false
  });
  const [clarificationChoice, setClarificationChoice] = useState<OptionId>();
  const [riskChecked, setRiskChecked] = useState(false);
  const display = props.session?.display;
  const setupOpen = props.session?.setupOpen === true;
  const showUnsupported =
    props.enabled && !props.supportedShell && props.session?.unsupportedDismissed !== true && !display && !setupOpen;
  const visible = setupOpen || Boolean(display) || showUnsupported;
  const viewKey = setupOpen
    ? `setup-${props.enabled}-${props.session?.auth.status}-${props.session?.signingIn}`
    : display
      ? `${display.status}-${'attemptId' in display ? display.attemptId || '' : ''}`
      : showUnsupported
        ? 'unsupported'
        : 'closed';

  useEffect(() => {
    if (visible && props.active) headingRef.current?.focus({preventScroll: true});
  }, [props.active, viewKey, visible]);

  useEffect(() => {
    if (display?.status === 'clarification') setClarificationChoice(display.choices[0]?.optionId);
  }, [display?.status === 'clarification' ? display.planId : undefined]);

  useEffect(() => {
    setRiskChecked(false);
  }, [
    display?.status === 'review' ? display.planId : undefined,
    display?.status === 'review' ? display.editRevision : undefined,
    props.session?.selectedOptionId
  ]);

  const selectedOption = useMemo(
    () =>
      display?.status === 'review'
        ? display.options.find((option) => option.optionId === props.session?.selectedOptionId) || display.options[0]
        : undefined,
    [display, props.session?.selectedOptionId]
  );

  if (!visible) return null;

  const close = () => {
    props.onDismiss();
    if (props.active) props.onRestoreTerminalFocus();
  };

  const panelHeader = (eyebrow: string, heading: string, status: string, danger = false) => (
    <div className="nli_header">
      <div>
        <p className="nli_eyebrow">{eyebrow}</p>
        <h2 id={`nli-title-${props.sessionUid}`} ref={headingRef} tabIndex={-1}>
          {heading}
        </h2>
      </div>
      <span className={danger ? 'nli_status nli_dangerText' : 'nli_status'}>{status}</span>
    </div>
  );

  let content: React.ReactNode;
  if (setupOpen && !props.enabled) {
    content = (
      <>
        {panelHeader('Natural language setup', 'Turn on shell-first suggestions', 'Disabled')}
        <p>
          Hyper tries every entry in your terminal first. Codex is contacted only after supported PowerShell reports an
          unresolved command.
        </p>
        <h3>Hyper configuration</h3>
        <pre className="nli_configBlock" tabIndex={0}>
          {NLI_CONFIG_BLOCK}
        </pre>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={props.onOpenConfig}>
            Open Hyper Configuration
          </button>
          <button type="button" onClick={props.onCheckStatus}>
            Check Codex status
          </button>
          <button type="button" onClick={close}>
            Close
          </button>
        </div>
      </>
    );
  } else if (setupOpen && props.session?.signingIn) {
    content = (
      <>
        {panelHeader('Codex sign-in', 'Finish signing in with ChatGPT in your browser', 'Waiting for browser')}
        <p aria-live="polite">
          Hyper is waiting for the official Codex browser sign-in to finish. No token is shown to or stored by the
          renderer.
        </p>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={props.onLogin}>
            Open sign-in page again
          </button>
          <button type="button" onClick={props.onCancel}>
            Cancel sign-in
          </button>
        </div>
      </>
    );
  } else if (setupOpen && props.session?.auth.status === 'signed-in') {
    content = (
      <>
        {panelHeader('Codex account', 'Signed in with ChatGPT', 'Ready')}
        <p>
          Natural-language fallback can request command proposals only after supported PowerShell reports an unresolved
          command.
        </p>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={close}>
            Done
          </button>
          <button type="button" className="nli_danger" onClick={props.onLogout}>
            Log out of Codex
          </button>
          <button type="button" onClick={props.onResetPrivacy}>
            Reset privacy choices
          </button>
        </div>
      </>
    );
  } else if (setupOpen && props.session?.auth.status === 'error') {
    const copy = setupAuthErrorCopy(props.session.auth.code);
    content = (
      <>
        {panelHeader('Natural language setup', copy.heading, 'Setup error', true)}
        <div className="nli_notice nli_dangerNotice" role="alert">
          {copy.body}
        </div>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={props.onCheckStatus}>
            {props.session.auth.code === 'NLI_KEYRING_UNAVAILABLE' ? 'Retry keyring check' : 'Retry'}
          </button>
          {props.session.auth.code === 'NLI_USERDATA_UNWRITABLE' ? (
            <button type="button" onClick={props.onOpenConfig}>
              Show setup help
            </button>
          ) : null}
          <button type="button" onClick={close}>
            Cancel
          </button>
        </div>
      </>
    );
  } else if (setupOpen) {
    content = (
      <>
        {panelHeader(
          'Natural language setup',
          'Codex and privacy controls',
          props.supportedShell ? 'PowerShell ready' : 'Setup'
        )}
        <p>
          The fallback is shell-first and off the valid-command hot path. Sign-in uses the official Codex browser flow.
        </p>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={props.onLogin}>
            Sign in with ChatGPT
          </button>
          <button type="button" onClick={props.onOpenConfig}>
            Open Hyper Configuration
          </button>
          <button type="button" onClick={props.onResetPrivacy}>
            Reset privacy choices
          </button>
          <button type="button" onClick={close}>
            Close
          </button>
        </div>
      </>
    );
  } else if (showUnsupported) {
    content = (
      <>
        {panelHeader('Natural language fallback', 'PowerShell is required for automatic fallback', 'Unsupported shell')}
        <div className="nli_notice">
          <strong>This {props.shell || 'configured shell'} session is unchanged.</strong> Hyper will not inspect its
          output or guess from exit codes. Start a new interactive PowerShell 5.1 or PowerShell 7 session.
        </div>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={props.onOpenConfig}>
            Open Hyper Configuration
          </button>
          <button type="button" onClick={close}>
            Dismiss
          </button>
        </div>
      </>
    );
  } else if (display?.status === 'unsupported') {
    content = (
      <>
        {panelHeader('Natural language fallback', 'PowerShell is required for automatic fallback', 'Unsupported shell')}
        <div className="nli_notice">
          <strong>This {props.shell || 'configured shell'} session is unchanged.</strong> {display.message}
        </div>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={props.onOpenConfig}>
            Open Hyper Configuration
          </button>
          <button type="button" onClick={close}>
            Dismiss
          </button>
        </div>
      </>
    );
  } else if (display?.status === 'privacy-required') {
    content = (
      <>
        {panelHeader('First use', 'Choose what Codex may receive', 'Consent required')}
        <p>
          Codex receives the failed line, PowerShell family and version, operating system, an opaque attempt ID, and a
          one-way working-directory fingerprint. Hyper never adds terminal history, scrollback, environment variables,
          clipboard contents, file contents, diffs, credentials, or remote URLs as separate context. A failed line that
          looks like a credential stays local unless you explicitly allow it below.
        </p>
        <fieldset>
          <legend>Optional context</legend>
          <label>
            <input
              type="checkbox"
              checked={privacy.includeWorkingDirectory}
              onChange={(event) => setPrivacy({...privacy, includeWorkingDirectory: event.target.checked})}
            />{' '}
            <span>
              <strong>Working directory</strong>
              <small>Share the current path for this interpretation.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={privacy.includeGitMetadata}
              onChange={(event) => setPrivacy({...privacy, includeGitMetadata: event.target.checked})}
            />{' '}
            <span>
              <strong>Limited Git metadata</strong>
              <small>Repository, branch, staged/unstaged/untracked, remote-presence, and GitHub CLI flags only.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={privacy.shareSecretLookingInput}
              onChange={(event) => setPrivacy({...privacy, shareSecretLookingInput: event.target.checked})}
            />{' '}
            <span>
              <strong>Secret-looking failed input</strong>
              <small>Off by default. Screening is local and heuristic.</small>
            </span>
          </label>
        </fieldset>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={() => props.onPrivacy(privacy)}>
            Accept and sign in with ChatGPT
          </button>
          <button type="button" onClick={close}>
            Not now
          </button>
          <button type="button" className="nli_danger" onClick={props.onResetPrivacy}>
            Reset privacy choices
          </button>
        </div>
      </>
    );
  } else if (display?.status === 'auth-required') {
    content = (
      <>
        {panelHeader('Codex sign-in', 'Sign in with ChatGPT to continue', 'Authentication required')}
        <p>
          The browser handles OAuth. Credentials remain in the operating-system keyring and never enter Hyper's
          renderer.
        </p>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={props.onLogin}>
            Sign in with ChatGPT
          </button>
          <button type="button" onClick={close}>
            Cancel
          </button>
        </div>
      </>
    );
  } else if (display?.status === 'interpreting') {
    content = (
      <>
        {panelHeader('Natural language fallback', 'Finding safe command options', 'Interpreting')}
        <p aria-live="polite" aria-atomic="true">
          Codex is interpreting the unresolved PowerShell entry. Nothing will run without your approval.
        </p>
        <div className="nli_actions">
          <button type="button" onClick={props.onCancel}>
            Cancel interpretation
          </button>
        </div>
      </>
    );
  } else if (display?.status === 'clarification') {
    content = (
      <>
        {panelHeader('Clarification', display.question, 'Choose one')}
        <fieldset>
          <legend>Use arrow keys to move between choices.</legend>
          {display.choices.map((choice) => (
            <label key={choice.optionId}>
              <input
                type="radio"
                name={`nli-clarification-${props.sessionUid}`}
                checked={clarificationChoice === choice.optionId}
                onChange={() => setClarificationChoice(choice.optionId)}
              />
              <span>
                <strong>{choice.label}</strong>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="nli_actions">
          <button
            type="button"
            className="nli_primary"
            disabled={!clarificationChoice}
            onClick={() => clarificationChoice && props.onClarify(clarificationChoice)}
          >
            Continue
          </button>
          <button type="button" onClick={props.onReject}>
            Cancel
          </button>
        </div>
      </>
    );
  } else if (display?.status === 'review' && selectedOption) {
    const highRisk = selectedOption.risk.requiresSecondConfirmation;
    content = (
      <>
        {panelHeader(
          'Suggested command',
          'Review before sending to PowerShell',
          `${display.options.length} option${display.options.length === 1 ? '' : 's'}`,
          highRisk
        )}
        <p>{display.summary}</p>
        {display.options.length > 1 ? (
          <fieldset>
            <legend>Choose an exact command option.</legend>
            {display.options.map((option) => (
              <label key={option.optionId}>
                <input
                  type="radio"
                  name={`nli-option-${props.sessionUid}`}
                  checked={selectedOption.optionId === option.optionId}
                  onChange={() => props.onSelectOption(option.optionId)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.purpose}</small>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {selectedOption.rationale ? <p>{selectedOption.rationale}</p> : null}
        {selectedOption.assumptions.length ? (
          <ul>
            {selectedOption.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        ) : null}
        {props.session?.editing ? (
          <label className="nli_editLabel" htmlFor={`nli-edit-${props.sessionUid}`}>
            <span>Exact command to send</span>
            <textarea
              id={`nli-edit-${props.sessionUid}`}
              spellCheck={false}
              value={props.session.editText}
              onChange={(event) => props.onUpdateEdit(event.target.value)}
            />
          </label>
        ) : (
          <pre className="nli_commandText" tabIndex={0}>
            {selectedOption.commandPreview}
          </pre>
        )}
        <div className={highRisk ? 'nli_notice nli_dangerNotice' : `nli_risk nli_${selectedOption.risk.level}`}>
          <strong>{riskLabel(selectedOption.risk.level)}.</strong>{' '}
          {selectedOption.risk.reasons.join(' ') || 'Review the exact command before approval.'}
        </div>
        {highRisk && props.session?.highRiskArmed ? (
          <label>
            <input type="checkbox" checked={riskChecked} onChange={(event) => setRiskChecked(event.target.checked)} />{' '}
            <span>
              <strong>I reviewed the exact command and target</strong>
              <small>Editing or changing options invalidates this confirmation.</small>
            </span>
          </label>
        ) : null}
        <div className="nli_actions">
          {props.session?.editing ? (
            <>
              <button type="button" className="nli_primary" onClick={props.onSaveEdit}>
                Save edit for fresh review
              </button>
              <button type="button" onClick={props.onCancelEdit}>
                Cancel edit
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="nli_primary"
                disabled={highRisk && props.session?.highRiskArmed === true && !riskChecked}
                onClick={props.onApprove}
              >
                {highRisk
                  ? props.session?.highRiskArmed
                    ? 'Confirm and send once'
                    : 'Review high-risk command'
                  : 'Approve and send once'}
              </button>
              <button type="button" onClick={props.onBeginEdit}>
                Edit
              </button>
              <button type="button" onClick={props.onReject}>
                Reject
              </button>
            </>
          )}
        </div>
      </>
    );
  } else if (display?.status === 'error' || display?.status === 'stale') {
    const copy = errorCopy(display);
    const approvalWasConsumed = display.code === 'NLI_SESSION_CLOSED' || display.code === 'NLI_WRITE_FAILED';
    content = (
      <>
        {panelHeader(copy.eyebrow, copy.heading, display.status === 'stale' ? 'Stale' : 'Error', true)}
        <div className="nli_notice nli_dangerNotice" role="alert">
          {copy.body}
        </div>
        <div className="nli_actions">
          {approvalWasConsumed ? null : (
            <button type="button" className="nli_primary" onClick={props.onRetry}>
              Try again
            </button>
          )}
          <button type="button" onClick={close}>
            Dismiss
          </button>
        </div>
      </>
    );
  } else if (display?.status === 'sent') {
    content = (
      <>
        {panelHeader('Sent to terminal', 'The approved command was written once', 'Handed back to PowerShell')}
        <p aria-live="polite" aria-atomic="true">
          Hyper made one write attempt through the original terminal session. Terminal output is now the source of
          truth.
        </p>
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={close}>
            Return focus to terminal
          </button>
        </div>
      </>
    );
  } else {
    content = (
      <>
        {panelHeader('Natural language fallback', 'Assistance was cancelled', 'Cancelled')}
        <div className="nli_actions">
          <button type="button" className="nli_primary" onClick={close}>
            Return to terminal
          </button>
        </div>
      </>
    );
  }

  return (
    <section
      className="nli_panel"
      data-testid="nli-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={`nli-title-${props.sessionUid}`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      {content}
      {setupOpen && !props.enabled ? (
        <p className="nli_keyboard">
          Keyboard: focus starts on this heading. Use Tab or Shift+Tab through actions. Escape closes the panel and
          restores terminal focus. Opening this panel never makes Enter run a command.
        </p>
      ) : null}
      <style jsx>{`
        .nli_panel {
          position: relative;
          width: 100%;
          max-height: min(58vh, 430px);
          overflow: auto;
          box-sizing: border-box;
          padding: 14px;
          border: 0;
          border-top: 1px solid ${props.borderColor};
          background: linear-gradient(180deg, rgba(25, 25, 25, 0.98), rgba(12, 12, 12, 0.99)), ${props.backgroundColor};
          color: ${props.foregroundColor};
          font-family: ${props.uiFontFamily};
          font-size: 13px;
        }
        .nli_header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }
        .nli_eyebrow {
          margin: 0 0 4px;
          color: #68fdfe;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }
        h2 {
          margin: 0;
          font-size: 15px;
          line-height: 1.35;
          outline: none;
        }
        h2:focus-visible,
        button:focus-visible,
        input:focus-visible,
        textarea:focus-visible,
        pre:focus-visible {
          outline: 2px solid #68fdfe;
          outline-offset: 2px;
        }
        h3 {
          margin: 14px 0 7px;
          font-size: 12px;
        }
        p {
          margin: 7px 0;
          line-height: 1.45;
        }
        .nli_status {
          display: inline-flex;
          align-items: center;
          flex: none;
          min-height: 24px;
          padding: 3px 8px;
          border: 1px solid ${props.borderColor};
          border-radius: 999px;
          color: #a9a9a9;
          font-size: 11px;
        }
        .nli_dangerText {
          border-color: #8f3937;
          color: #fd6f6b;
        }
        pre {
          width: 100%;
          margin: 7px 0;
          padding: 9px 10px;
          overflow: auto;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          user-select: text;
          border: 1px solid ${props.borderColor};
          border-radius: 4px;
          background: #050505;
          color: #eee;
          font-family: Menlo, 'DejaVu Sans Mono', Consolas, monospace;
          font-size: 12px;
          line-height: 1.5;
        }
        .nli_configBlock {
          margin-top: 12px;
          min-height: 182px;
        }
        .nli_commandText {
          margin-top: 11px;
          margin-bottom: 13px;
        }
        fieldset {
          display: grid;
          gap: 8px;
          margin: 12px 0;
          padding: 0;
          border: 0;
        }
        legend {
          margin-bottom: 7px;
          color: #a9a9a9;
          font-size: 12px;
        }
        label {
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          gap: 8px;
          padding: 9px;
          border: 1px solid ${props.borderColor};
          border-radius: 5px;
          background: #121212;
        }
        label:has(input:checked) {
          border-color: #20c5c6;
          background: #102223;
        }
        label span {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        label small {
          color: #a9a9a9;
          line-height: 1.4;
        }
        input {
          margin-top: 3px;
          accent-color: #20c5c6;
        }
        ul {
          margin: 8px 0 10px;
          padding-left: 20px;
          color: #c7c7cc;
        }
        .nli_editLabel {
          display: grid;
          gap: 7px;
        }
        textarea {
          width: 100%;
          min-height: 86px;
          box-sizing: border-box;
          resize: vertical;
          padding: 10px;
          border: 1px solid ${props.borderColor};
          border-radius: 4px;
          background: #202020;
          color: ${props.foregroundColor};
          font-family: Menlo, Consolas, monospace;
        }
        .nli_notice {
          margin: 11px 0;
          padding: 9px 10px;
          border-left: 3px solid #fffa72;
          background: rgba(255, 250, 114, 0.07);
        }
        .nli_dangerNotice {
          border-left-color: #fd6f6b;
          background: rgba(253, 111, 107, 0.08);
        }
        .nli_risk {
          display: block;
          margin-top: 6px;
          font-size: 11px;
          font-weight: 700;
        }
        .nli_low {
          color: #67f86f;
        }
        .nli_medium {
          color: #fffa72;
        }
        .nli_actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        button {
          min-height: 32px;
          padding: 6px 11px;
          border: 1px solid #555;
          border-radius: 4px;
          background: #202020;
          color: ${props.foregroundColor};
          font: inherit;
          cursor: pointer;
        }
        button:hover {
          border-color: #20c5c6;
        }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.48;
        }
        .nli_primary {
          border-color: #20c5c6;
          background: #0c3738;
        }
        .nli_danger {
          border-color: #8f3937;
        }
        .nli_keyboard {
          margin: 12px 0 0;
          padding-top: 8px;
          border-top: 1px solid ${props.borderColor};
          color: #a9a9a9;
          font-size: 11px;
        }
        @media (max-width: 480px) {
          .nli_panel {
            max-height: min(70vh, 500px);
            padding: 12px;
          }
          .nli_header {
            display: grid;
            gap: 12px;
          }
          .nli_status {
            justify-self: start;
          }
          .nli_actions {
            display: grid;
          }
          button {
            width: 100%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
};

export default NliPanel;
