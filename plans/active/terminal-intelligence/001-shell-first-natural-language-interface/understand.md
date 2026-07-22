# Understanding shell-first natural-language assistance

## TL;DR

Hyper still sends every keystroke to the existing terminal path first. It does not ask AI whether text is a command. Only a nonce-authenticated `command-not-found` event from a supported PowerShell session may create a Codex request, and the user must review and approve exact command text before main writes it once to the original PTY.

The shipped adapter supports interactive Windows PowerShell 5.1 and PowerShell 7. Codex runs as a hidden, proposal-only app-server child with browser ChatGPT login, OS-keyring credentials, a private tool-free home, an empty working directory, and a sanitized environment. `cmd.exe`, WSL/SSH wrappers, bash, zsh, fish, and arbitrary REPLs remain ordinary terminals until they have an equally authoritative adapter.

## Concepts you need

### A hot path should not pay for a fallback

A hot path is code that runs for every normal interaction. Here it is xterm input -> renderer RPC -> `Session.write` -> node-pty. Adding model classification, provider startup, or awaited work there would slow every command. The implementation leaves that path synchronous and unchanged; `test/unit/nli-performance.test.ts` guards provider construction and latency.

### Semantic events beat output guessing

Localized error text and nonzero exit codes are ambiguous. A PowerShell lookup hook can instead report the point where command resolution genuinely remains unresolved. `app/nli/powershell-integration.ts` installs that hook only for accepted interactive launches, and `app/nli/osc-parser.ts` accepts only bounded private frames with the expected window, session, callback, and nonce.

### Model output is data, not authority

Codex can propose one to three commands or a clarification, but it cannot execute tools or choose bytes for the PTY at approval time. `app/nli/command-plan.ts` validates a bounded schema, computes local risk, and binds immutable plan data. Renderer RPC carries display data and opaque IDs; `app/nli/execution.ts` asks the main-owned service for the stored bytes and makes one non-retried write attempt.

### Shared state needs shared revocation

Privacy preferences and Codex keyring identity are per-install, while Hyper may have several BrowserWindows. `app/nli/window-coordinator.ts` registers each live window service so Reset Privacy and Logout cancel or clear every window before broadcasting the new auth state. A window unregisters before its service is disposed.

### Capability checks are stronger than version checks

Codex 0.144.6 is the minimum supported CLI, but a version string does not prove the required protocol or isolation settings. `app/nli/codex-app-server.ts` checks initialization and effective locked-down configuration at startup, then validates account and thread/turn response shapes lazily when those paths are used. Missing or incompatible behavior fails closed.

## The system, in plain English

1. The user types into Hyper. Hyper immediately sends those bytes to the same PowerShell process it always used.
2. If PowerShell accepts the command, nothing AI-related happens. An ordinary command that returns an error code also does not trigger AI.
3. If PowerShell cannot resolve the command name, the installed hook emits a private authenticated marker. Hyper preserves the normal PowerShell error, flushes it visibly, and then opens assistance for that pane.
4. On first use, Hyper explains exactly what may be shared. Consent and ChatGPT sign-in happen only after the failure; valid commands never start Codex.
5. Codex returns structured suggestions. Hyper rejects malformed, oversized, tool-seeking, stale, replayed, or otherwise invalid responses.
6. The user chooses, edits, rejects, clarifies, or retries. High-risk text needs a second deliberate confirmation.
7. On approval, main rechecks the window, renderer, pane, shell, cwd fingerprint, attempt, plan, option, edit revision, and one-time authorization. It then writes the stored command once to that same PTY.
8. A generated command is tagged so another lookup failure cannot recurse into AI. Closing a pane/window, typing new input, changing context, resetting privacy, logging out, or disabling the feature cancels the relevant work.

## The system, with the jargon back in

`lib/components/term.tsx` and the existing `sendSessionData` callers still feed `app/ui/window.ts`, which synchronously invokes `Session.write`. Session creation may call `detectShellIntegration` and `createPowerShellIntegration`; unsupported or conflicting shell arguments are returned unchanged.

PTY output passes through a streaming `OscEventParser`. Valid semantic tokens enter `ShellSemanticEventGate`, while visible tokens keep their original ordering through `DataBatcher`. `NliService.onCommandNotFound` deduplicates callbacks, snapshots the original session identity, applies consent/auth gates, and lazily creates an `NliProvider`.

`CodexAppServerProvider` speaks JSONL over piped stdio with `shell: false` and `windowsHide: true`. It generates a private `CODEX_HOME` configured for keyring credentials, `approval_policy = "never"`, read-only sandboxing, disabled web search, and disabled tools/apps/hooks/multi-agent/plugins/memories/goals. Its child receives an allowlisted environment and an empty app-controlled cwd. Unexpected server tool, file, or approval requests are denied before dispatch and abort the interpretation.

Validated `NliProviderResult` values become an `ImmutableCommandPlan`. Renderer state is per `SessionUid`, but command authority stays in main. `executeApprovedCommand` synchronously consumes `NliApprovalDecision`, calls `tagGeneratedWrite`, invokes the original session's `write`, and records sent, not-sent, or unknown outcome without retrying.

`NliWindowCoordinator` is the main-process fanout boundary for per-install revocation. Its tests cover two registered windows, idempotent unregister, and exact Reset Privacy/Logout RPC routing.

## Decisions and what we rejected

| Decision | Chosen approach | Rejected alternative | Accepted tradeoff |
| --- | --- | --- | --- |
| Trigger timing | Execute through the original PTY first | Pre-classify every line with AI | Assistance appears only after authoritative shell failure, preserving valid-command latency. |
| Failure signal | Authenticated PowerShell lookup hook | Output regexes or nonzero exit codes | Automatic fallback initially supports fewer shells but avoids false triggers. |
| Provider authority | Proposal-only Codex app-server | Terminal tools, repository cwd, project instructions, plugins, or approval authority | Hyper must own more validation and review state, but interpretation cannot execute. |
| Command authority | Opaque renderer IDs plus main-owned immutable bytes | Send authoritative command text back from Redux | Main retains a plan vault and context digest, preventing stale renderer text from replacing approval. |
| PTY delivery | Consume one approval before one write attempt | Automatically retry PTY errors | An uncertain delivery is shown honestly and needs human inspection. |
| Supported adapters | Interactive PowerShell 5.1/7 only | Pretend `cmd.exe`, WSL, SSH, or Unix shells expose equivalent semantics | Broader shell support is deferred until each adapter can prove the same invariants. |
| Shared revocation | Cross-window reset/logout coordinator | Update only the invoking window | A small registry is maintained so per-install preference and identity changes reach every window. |

## Watch out for

- Do not add model classification, provider construction, filesystem work, or `await` before `Session.write` on ordinary input.
- Do not infer command-not-found from output text or any generic nonzero status.
- Preserve PowerShell profiles, existing `CommandNotFoundAction`, prompts, Unicode, and unsupported argument lists when changing the adapter.
- Keep private OSC parsing paired with the existing integrated tab until it closes. Turning the service off stops AI work, but removing the parser early could expose private frames as terminal text.
- Never place tokens, raw provider stderr, command bytes, cwd paths, environment, scrollback, history, files, or remote URLs in renderer state or routine logs.
- Treat provider protocol/config checks as fail-closed. Account and thread/turn methods are intentionally checked when first used, not all at startup.
- Codex owns in-use token refresh. Hyper reads account state with `refreshToken: false` and never transports credentials.
- The isolated packaged smoke uses a deterministic provider seam; it proves one GUI app, no child top-level window, descendant cleanup, profile isolation, and exact temp cleanup. The real Codex hidden-spawn contract is proven separately by provider tests asserting `windowsHide: true` and disposal.

## To go deeper

- [Plan](./plan.md) — shipped behavior, boundaries, rollback, and Definition of Done.
- [Vision](./vision.md) — module APIs, invariants, threat model, and test matrix.
- [Codex provider task](./tasks/04-codex-app-server-oauth-provider.md) — OAuth, keyring, protocol, and isolation work.
- [Approval task](./tasks/07-main-owned-approval-and-exact-pty-execution.md) — exact-byte authority and one-write semantics.
- [Verification task](./tasks/08-comprehensive-verification-and-packaging.md) — unit, Electron, visual, packaging, and latency evidence.
- [Final delivery flow](./flow/task-10-final-integration-review-and-dev-delivery.md) — final coordination and release path.
- [User and maintainer guide](../../../../docs/natural-language-interface.md) — setup, support matrix, privacy, troubleshooting, and extension checklist.

## Self-check

1. Does a valid command ever initialize Codex?

   No. The original PTY write happens first; only a later authenticated unresolved-command event can enter NLI.

2. Does any nonzero exit trigger NLI?

   No. Only the PowerShell lookup hook can emit the accepted semantic event.

3. Can Codex execute a proposed command?

   No. Tools and approvals are disabled or denied; only explicit user approval lets main write stored bytes once.

4. Why are command choices identified by opaque IDs?

   The renderer can select a main-owned immutable option without becoming the authority for shell text.

5. What invalidates approval?

   A newer attempt, input or context change, cwd or shell change, pane or window change, edit revision, close, replay, cancellation, or already-consumed authorization.

6. Why does Logout fan out across windows?

   Codex identity is shared per install, so every live service and renderer session must observe revocation.

7. What proves the release?

   Lint plus 113 tests, production build, Windows unpacked package, 8 Electron journeys, 10 verified Cue proof obligations, sub-2% visual diffs, and the isolated one-app/no-dangling-process smoke.
