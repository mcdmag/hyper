
# Task 02: Add authoritative PowerShell failure events

## In plain English

Teach supported PowerShell sessions to report a real unresolved command lookup while leaving all user input and ordinary output on Hyper's original path.

## Work

- [ ] Implement shell-family/argument detection for pwsh.exe and powershell.exe. Instrument only interactive sessions; refuse -File, -Command, -EncodedCommand, unknown conflicting args, cmd.exe, wsl.exe, git-cmd.exe, and arbitrary shells.
- [ ] Generate a hook script under a Hyper userData subdirectory. Load it after profiles through safe startup argument augmentation without changing process.env.
- [ ] Wrap and preserve any existing CommandNotFoundAction. Emit only when the previous handler has not resolved Command or CommandScriptBlock.
- [ ] Capture the complete submitted PowerShell line and emit a versioned nonce-tagged private OSC frame containing bounded UTF-8/base64 data, session identity, reason, and event ID.
- [ ] Implement a chunk-safe bounded parser before Session's DataBatcher; flush visible error bytes before emitting the semantic event, strip only valid own frames, and preserve all other bytes exactly.
- [ ] Make install/cleanup/re-init idempotent, dedupe event IDs, enforce the plan.md setup/parser budgets, and leave original shell args untouched on every failure.
- [ ] Add test/unit/nli-shell-integration.test.ts and availability-gated real node-pty fixtures for PowerShell 5.1/7.

## Tests and verification

- [ ] Unit fixtures cover shell detection, safe/conflicting args, Unicode/base64, wrong nonce, malformed/oversized/truncated frames, every chunk boundary, duplicate event IDs, byte ordering, and byte preservation.
- [ ] Availability-gated node-pty fixtures prove PowerShell 5.1/7 profiles/prompts load, valid command emits none, missing command emits once after visible error, prior resolver suppresses fallback, and two sessions isolate nonces.
- [ ] Explicit negatives cover cmd /c exit 1, git diff --exit-code, false-equivalents, syntax errors, child output resembling markers, and unsupported shells.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-shell-integration.test.ts
- [ ] Run: pnpm lint
