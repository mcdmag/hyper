# Understanding the delivered system

## User-visible contract

Hyper remains a terminal first. Renderer input follows the existing xterm -> session-data RPC -> `Session.write` -> node-pty path synchronously. NLI does not classify input and cannot delay a valid command. A provider is created only after supported PowerShell emits a nonce-authenticated, strictly parsed command-not-found frame and the ordinary shell error has been flushed visibly.

The user then sees a bounded clarification or one-to-three exact command choices. Model output is untrusted data: main validates the schema, applies deterministic local risk rules, retains the authoritative bytes, and exposes only display data plus opaque IDs. Edits create a new revision. Context changes, new input, replay, pane closure, and shell/cwd changes invalidate approval. High-risk text needs a second confirmation. Main atomically consumes one approval and makes one synchronous, non-retried write attempt to the original PTY.

## Ownership map

- `app/session.ts` owns PTY writes, shell startup integration, private OSC parsing, and visible-output ordering.
- `app/nli/powershell-integration.ts` preserves interactive PowerShell profiles and prior command lookup handlers while emitting only authoritative unresolved lookups.
- `app/nli/service.ts` owns attempts, consent/auth gates, stale checks, provider lifecycle, immutable plan authority, approval consumption, and generated-command recursion tags.
- `app/nli/codex-app-server.ts` is a proposal-only Codex adapter with browser ChatGPT login, keyring-only credentials, a private `CODEX_HOME`, empty cwd, allowlisted environment, disabled tools/apps/hooks/MCP-like extensions/web search, and fail-closed capability checks.
- `app/nli/window-coordinator.ts` makes per-install Privacy Reset and Logout effective across every open Hyper window.
- `app/nli/command-plan.ts` validates provider output, screens secret-looking input locally, classifies risk, and binds plan digests.
- `app/nli/execution.ts` validates the actual IPC sender, sets or clears the service-owned recursion tag, and performs the one original-session write attempt.
- `lib/components/nli-panel.tsx` and the NLI reducer/actions provide an accessible, per-pane, non-modal review experience without command authority.

## Privacy boundary

Required provider context is the failed line, PowerShell/OS identity, opaque attempt ID, and a one-way cwd fingerprint. Raw cwd, limited Git metadata, and secret-looking input each stay behind explicit preferences. No scrollback, history, environment, clipboard, files, diffs, remote URLs, tokens, or provider stderr cross into renderer state or routine diagnostics. Reset removes the shared non-secret preference file and cancels active work in all windows. Logout asks every live provider to clear the shared keyring-backed Codex login.

## Operational boundary

Automatic fallback currently supports only recognized interactive PowerShell 5.1/7 launches. `cmd.exe`, WSL/SSH wrappers, bash, zsh, fish, arbitrary shells, and conflicting PowerShell modes remain normal terminals. Supporting one later requires a new authoritative adapter with startup/profile preservation, bounded authenticated events, byte preservation, dedupe, visible-error ordering, and the same performance/privacy/approval proofs; output regexes and nonzero exit codes are not acceptable substitutes.

Disabling NLI cancels provider work and prevents integration in future sessions. Existing integrated PowerShell tabs retain their paired hidden parser/hook until closed so private frames never leak into visible terminal output; with the service disabled they perform no AI work. Codex credentials persist until explicit Logout.

## Evidence map

- User and maintainer guide: `docs/natural-language-interface.md`
- Full acceptance contract: `vision.md` and `plan.md`
- Unit/PTY/security tests: `test/unit/nli-*.test.ts`
- Packaged Electron journeys: `test/index.ts`
- Single-app Windows smoke: `scripts/test-nli-packaged.ps1`
- Visual and packaged artifacts: `proof/artifacts/task08/`
- Proof obligation ledger: `proof/manifest.json`
