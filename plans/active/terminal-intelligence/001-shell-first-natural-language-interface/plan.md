# Shell-first natural-language interface

## Goal

Add an opt-in natural-language fallback to Hyper without putting AI on the command execution hot path. Every input byte continues through Hyper's existing xterm -> RPC -> node-pty path first. Only an authoritative shell command-not-found event may start Codex interpretation. A valid command that exits nonzero must never invoke Codex.

The first supported automatic adapter is interactive PowerShell 5.1 and PowerShell 7. cmd.exe, WSL launcher sessions, SSH/tmux inner shells, and arbitrary configured shells fail closed until they have an authoritative adapter. The UI must state support clearly and may direct a Windows user to open/configure a PowerShell profile.

## Product behavior

1. With NLI disabled or an unsupported shell, Hyper behaves exactly as it does today.
2. With NLI enabled on supported PowerShell, user input is written to the PTY immediately with no provider initialization or network work.
3. A PowerShell command lookup hook preserves any existing handler and emits a nonce-tagged private OSC event only when lookup remains unresolved.
4. Hyper renders the ordinary shell error first, correlates one semantic failure to one session attempt, then lazily asks Codex for bounded structured command options.
5. First use discloses the exact context shared and offers ChatGPT/Codex browser sign-in.
6. The user selects, edits, rejects, or approves exact command text. Opening the panel never executes anything.
7. Main process retains the immutable plan. Approval references opaque IDs, is invalid after edits/session/cwd changes, and writes the accepted text exactly once through the original Session/node-pty boundary.
8. A generated command cannot recursively invoke NLI. Provider/auth/offline errors never block the shell.

## Scope

In scope:

- PowerShell 5.1 and 7 command-not-found instrumentation with profile/handler preservation.
- Chunk-safe private OSC framing and typed per-session events.
- Main-only Codex app-server client over stdio, using official ChatGPT browser login and OS keyring storage.
- A Hyper-specific hardened CODEX_HOME that disables shell tools, apps, hooks, multi-agent, MCP inheritance, skills/project instructions, and web search.
- Strict structured-output validation, deterministic local risk labeling, stale-context checks, and explicit approval.
- Accessible per-pane proposal UI, multiple options, editing, retry/cancel, privacy consent, auth states, and narrow-pane behavior.
- Fake-provider tests, real PowerShell seam tests where available, packaging smoke checks, and documentation.

Out of scope for this feature:

- Guessing command-not-found from generic localized terminal text.
- Treating exit 127, exit 9009, or any nonzero exit as sufficient evidence.
- Automatic fallback for cmd.exe, WSL wrappers, remote shells, bash, zsh, fish, or arbitrary REPLs without a future authoritative adapter.
- Codex executing tools, reading repository files, viewing scrollback/history/environment/clipboard, or owning raw OAuth tokens.
- General Electron renderer hardening; the new IPC is validated, but existing plugin/renderer privileges are documented separately.
- Automatic Codex CLI installation.

## Architecture

The implementation extends existing seams instead of adding a second terminal path:

- app/session.ts remains the single PTY owner and immediate writer.
- A shell adapter augments safe interactive PowerShell startup arguments and writes a generated hook script under Hyper userData.
- A bounded streaming parser strips only valid nonce-tagged private OSC frames from PTY output and emits semantic events; malformed or wrong-nonce bytes pass through unchanged.
- app/ui/window.ts wires session events to a main-only NliService and typed renderer RPC.
- NliService owns attempt cancellation, privacy/auth state, the immutable plan store, digests, local risk classification, approval validation, and exact-once PTY writes.
- CodexAppServerProvider is a proposal-only adapter. It starts lazily with shell:false, windowsHide:true, piped stdio, sanitized environment, an empty app-controlled cwd, and a Hyper-specific CODEX_HOME. Every server tool or approval request is denied and aborts interpretation.
- Renderer Redux state is keyed by session UID. NliPanel displays plain text safely and returns decisions or edits; it never becomes the source of truth for approved command bytes.

## Decisions and provenance

- UDC-0: The current raw input/output flow and all sendSessionData callers were traced in source.
- UDC-1: Official Codex documentation and generated local app-server schemas support account login/read/logout, thread/start, turn/start, cancellation, streamed events, and outputSchema.
- UDC-2: V1 automatic support is PowerShell-only. This is the narrowest truthful adapter and is paired with unsupported-shell tests and documentation.
- UDC-2: One explicit approval covers one exact selected payload. An edit creates a new plan/digest and requires fresh approval; locally high-risk text adds a second deliberate confirmation. Companion reducer/service tests cover every transition.
- UDC-2: A separate Hyper CODEX_HOME trades shared-login convenience for deterministic isolation from user tools/plugins/hooks. Browser sign-in remains official Codex OAuth and credentials stay in the keyring. Companion tests assert no tokens or inherited tool configuration cross IPC or PTY environment.

## Task order

1. Establish contracts, configuration, and test seams.
2. Produce and inspect the responsive interaction mockups.
3. Implement authoritative PowerShell integration and OSC parsing.
4. Implement the per-session shell-first controller and typed bridge.
5. Implement the hardened Codex app-server provider and OAuth states.
6. Implement schema validation, local risk classification, immutable approvals, and privacy filtering.
7. Build the accessible renderer workflow from the approved mockups.
8. Route approved text exactly once through Session.write with stale/recursion guards.
9. Complete unit, seam, E2E, packaging, and latency verification.
10. Discover and update all user/developer documentation.
11. Run final integration verification and prepare the dev-targeted delivery.

## Release and compatibility

The feature defaults off. When enabled, startup instrumentation is attempted only for recognized interactive PowerShell argument sets. Conflicting -File, -Command, or -EncodedCommand sessions remain untouched. Missing/incompatible Codex shows setup guidance after fallback, never a separate terminal window. The provider executable path is configurable; protocol capability is checked at runtime and incompatible versions fail with a clear message.

The feature branch and pull request must target dev explicitly. Do not target the repository's older default canary branch. After merge, fast-forward the local dev worktree.

## Verification

Run on every implementation task as applicable:

- pnpm lint
- pnpm test:unit
- pnpm run generate-schema after configuration type changes
- pnpm run build after main/renderer integration
- pnpm test:e2e for deterministic fake-provider scenarios
- pnpm run dist or the narrow Windows unpacked packaging target for the hidden-child smoke test

Final acceptance requires evidence that:

- A valid command reaches Session.write without provider creation and without new awaited work.
- Valid commands with nonzero status do not trigger NLI.
- One unresolved PowerShell command produces exactly one fallback after ordinary error output.
- Existing PowerShell command lookup handlers, profiles, prompts, Unicode, and two simultaneous sessions remain correct.
- cmd.exe and other unsupported shells are unchanged and do not heuristically trigger.
- Sign-in, cancel, token refresh behavior, logout, offline, timeout, malformed output, incompatible protocol, and app-server crash are handled.
- No tokens, scrollback, history, environment, file content, or command plans leak to logs, Redux beyond display data, electron-store, crash payloads, or spawned terminal environments.
- Selecting, editing, rejecting, approving, stale invalidation, high-risk confirmation, and exact-once execution work by keyboard and screen reader.
- The packaged Windows app spawns Codex with no console window and cleans it up on exit.

## Verification

- Verify each task's acceptance criteria before cue_done.
- Include unit or seam tests with every behavioral change; do not defer all testing to Task 08.
- Use fake Codex/app-server and fake PTY seams in CI; never require a live account for automated tests.
- Preserve unrelated user changes and untracked .cue/memory files.
- Final verification must include pnpm lint, pnpm test:unit, pnpm run build, applicable E2E, generated config schema cleanliness, and an unpacked Windows hidden-process smoke test.
- Any change to a public contract, support matrix, privacy field, or approval semantics requires updating vision/docs/tests in the same task.
- A task is not complete if valid commands create the provider, unsupported shells are modified, tokens reach renderer state, or approved bytes differ from displayed bytes.
