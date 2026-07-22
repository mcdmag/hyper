---
spec_id: 1
status: active
created: 2026-07-21
completed: null
category: terminal-intelligence
subsystems: []
scope_tags: [web-ui, auth, config, cli, performance]
---
# Vision: shell-first assistance that behaves like a terminal

## Outcome

Hyper remains a fast, predictable terminal. Users may type either a real command or a natural-language intent into the same prompt. Hyper never asks AI to decide whether input is a command. The shell decides first. Only an authoritative unresolved command lookup opens an assistive review flow, and only the user can authorize the exact resulting command.

Success feels like a small recovery layer attached to the existing terminal, not a chat product replacing it.

## Current system flow

1. lib/components/term.tsx receives xterm onData bytes.
2. lib/containers/terms.ts dispatches sendSessionData.
3. lib/actions/sessions.ts emits the typed data RPC.
4. app/ui/window.ts resolves the target session and calls Session.write.
5. app/session.ts immediately calls node-pty write.
6. node-pty output is batched for up to 16 ms and emitted to the renderer as session data.
7. lib/index.tsx dispatches that data into the existing session/terminal render flow.

Menu/keymap and startup-command callers also converge on sendSessionData. Hyper has no current command boundary, per-command exit status, or semantic command-not-found event.

## Future system flow

~~~mermaid
sequenceDiagram
    participant U as User
    participant X as xterm
    participant R as Renderer actions
    participant S as Main Session/node-pty
    participant P as PowerShell hook
    participant N as Main NLI service
    participant C as Codex app-server
    U->>X: type input and press Enter
    X->>R: raw onData bytes
    R->>S: existing data RPC
    S->>P: immediate PTY write
    alt valid or valid-but-failing command
        P-->>S: ordinary output only
        S-->>X: existing session data
    else unresolved command lookup
        P-->>S: ordinary error + nonce OSC event
        S-->>X: ordinary error output
        S->>N: command-not-found(attempt, session, line)
        N->>C: lazy proposal-only structured turn
        C-->>N: bounded command options
        N-->>R: display-safe proposal metadata
        R-->>U: choose/edit/reject/approve
        U->>R: approve opaque plan/option ID
        R->>N: typed approval RPC
        N->>N: recheck digest/session/cwd/risk
        N->>S: exact approved payload once
        S->>P: normal PTY execution
        P-->>X: streamed normal output
    end
~~~

## Systems thinking

The critical feedback loop is failure -> interpretation -> approval -> execution. It must not recurse. AI-originated writes are tagged; a lookup failure from them becomes a visible failed proposal with an explicit retry action, never another automatic request.

The terminal is concurrent. A proposal belongs to one session UID, one shell identity, one attempt ID, and one cwd snapshot. A newer attempt, session close, shell replacement, or cwd change invalidates it. The shell remains usable while interpretation runs; a newer command cancels stale work.

The terminal output stream is untrusted. Only a bounded frame with the per-session nonce and strict schema becomes an event. The nonce prevents accidental collisions, not hostile-code security; explicit approval remains the safety boundary.

The AI boundary is also untrusted. Model output is data, not authority. It must match the strict schema, pass size/control-character validation and deterministic local risk classification, and be retained immutably in main. Any Codex request to run a tool, read a file, modify a file, use MCP, ask for permissions, or collect more input aborts the turn.

## Decision justification

### User-value layer

Shell-first ordering preserves latency and muscle memory. Showing exact command text plus alternatives makes uncertainty visible. Keeping the ordinary shell error visible explains why assistance appeared.

### Product-safety layer

An authoritative shell hook avoids false activation on ordinary failures. Approval is mandatory for every generated payload. Edits invalidate approval. High-risk text needs an additional deliberate confirmation. Unsupported shells fail closed and remain normal terminals.

### Security/privacy layer

Codex runs in main as a hidden child, not in the PTY or renderer. Hyper uses a private app-specific CODEX_HOME with keyring-only credential storage and a tool-free configuration. Only failed input plus allowlisted shell/OS/context fields is sent after disclosure; scrollback, history, env, files, diffs, and clipboard are excluded. Secret-looking failed input remains local unless the user separately opts in to share it, with the disclosure stating that screening is heuristic.

### Implementation layer

The existing Session.write and session-data paths are reused. New code is limited to a shell adapter/parser, one main service/provider boundary, typed RPC, and one per-session UI slice. PowerShell is the first adapter because it exposes an authoritative CommandNotFoundAction hook; cmd.exe cannot meet the invariant without heuristics.

### Operations layer

The feature is off by default, capability-checked, cancelable, and observable through redacted state/error codes rather than command content. Fake providers make CI deterministic. Packaged Windows smoke tests enforce windowsHide and child cleanup.

## Module Boundaries

### Public API

- detectShellIntegration(shell: string, args: string[], enabled: boolean): ShellIntegrationDecision
  - Returns an immutable supported/unsupported decision and safe augmented args; never mutates caller arrays or process.env.
- createPowerShellIntegration(options: {sessionUid: string; nonce: string; scriptDirectory: string}): PowerShellIntegration
  - Materializes a non-secret hook and cleanup handle; preserves profiles and an existing lookup handler.
- OscEventParser.push(chunk: string): OscParseResult
  - Incrementally parses bounded private frames, preserves all non-frame bytes exactly, and never throws on PTY data.
- interface NliProvider
  - getAuthStatus, login, cancelLogin, logout, interpret(context, signal), dispose. Implementations validate and return only NliProviderResult values.
- NliService.onCommandNotFound(event), approve(request, identity), completeApproval(request), failApproval(request, code), edit(request), cancel(request), disposeSession(uid)
  - Owns lifecycle, privacy/auth gating, immutable plans, stale checks, and execution authorization.
- executeApprovedCommand(options: ExecuteApprovedCommandOptions): ApprovedCommandExecutionResult
  - Synchronously consumes main-owned authorization and makes at most one write attempt against the original session, with no await or automatic retry.
- validateCommandPlan is the bounded provider-output validator and returns only NliProviderResult or a typed validation error; it never coerces prose.
- classifyCommandRisk(shellText: string): LocalRiskAssessment
  - Deterministic advisory classification independent of model labels.
- Renderer actions openNliSetup, dismissNli, selectNliOption, beginNliEdit, updateNliEdit, cancelNliEdit, saveNliEdit, approveNli, rejectNli, clarifyNli, retryNli, loginNli, logoutNli, saveNliPrivacy, resetNliPrivacy.
- NliPanel props are display state and callbacks only; command authority remains in main.
- createNliWindowCoordinator(): NliWindowCoordinator
  - Creates the main-process coordinator whose `register` method returns an idempotent unregister callback and whose `resetPrivacy` and `logout` methods apply shared revocation to every live window before broadcasting the resulting auth state.
- Existing Session.write(data: string) remains the sole PTY write primitive used for both user and approved NLI bytes.
- Session writability remains an internal boolean guard used only at the original PTY approval boundary.

### Internals

Callers must not depend on OSC numeric identifiers, nonce format, generated PowerShell script contents, JSONL request IDs, Codex stderr, thread IDs, model prose, digest implementation, local risk regex layout, or Redux storage shape. These may change behind the public contracts.

### Invariants

- User bytes reach Session.write before any NLI work.
- No provider process, provider call, or network activity occurs for valid commands or ordinary nonzero exits.
- Only a strict unresolved-command event from a supported adapter starts automatic interpretation.
- One command attempt produces at most one interpretation.
- Shell/user handler behavior and visible output are preserved.
- Unsupported or conflicting shells are not modified.
- Auth secrets never enter renderer IPC, Redux, logs, electron-store, crash metadata, or PTY env.
- Provider tools are disabled and every unexpected tool/approval request fails closed.
- Renderer approval contains opaque IDs; main chooses stored exact bytes.
- Every edit, context change, or newer attempt invalidates previous approval.
- Generated writes execute once through Session.write and cannot recursively trigger.
- App-server is hidden on Windows and terminated with Hyper.

## Integration Surface

| Entry point | Current path | Change |
|---|---|---|
| xterm onData in lib/components/term.tsx | Terms -> sendSessionData | unchanged |
| renderer key/menu RPC handlers in lib/index.tsx | sendSessionData | unchanged |
| startup/CWD commands in lib/actions/ui.ts | sendSessionData | unchanged; regression test |
| data RPC in app/ui/window.ts | Session.write | unchanged |
| PTY output in app/session.ts | DataBatcher -> session data | semantic parser inserted before batching; visible bytes preserved |
| session creation in app/ui/window.ts / app/session.ts | spawn configured shell | safe PowerShell argument augmentation when enabled |
| config types/default/schema | profile/root config | add explicit NLI settings and regenerate schema |
| renderer root reducer/container tree | UI/session state | add per-session NLI state and panel |
| app shutdown/window cleanup | sessions/providers | dispose app-server and hook artifacts |

## Support and evolution

The initial automatic adapter covers interactive PowerShell 5.1 and 7. This is a correctness boundary: bash command_not_found_handle, zsh command_not_found_handler, and fish_command_not_found require their own startup/profile-preservation proofs before they can satisfy the invariant. cmd.exe remains unsupported unless Windows exposes a trustworthy semantic boundary; error text and 9009 alone are not sufficient.

A manual interpretation shortcut for unsupported shells is a separate product choice and is not used to weaken automatic-trigger guarantees.
