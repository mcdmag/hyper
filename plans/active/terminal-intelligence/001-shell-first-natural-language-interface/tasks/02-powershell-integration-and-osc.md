
# Task 02: Add authoritative PowerShell failure events

## In plain English

Teach supported PowerShell sessions to report a real unresolved command lookup while leaving all user input and ordinary output on Hyper's original path.

## Work

- [ ] Implement shell-family/argument detection for pwsh.exe and powershell.exe. Instrument only interactive sessions; refuse -File, -Command, -EncodedCommand, unknown conflicting args, cmd.exe, wsl.exe, git-cmd.exe, and arbitrary shells.
- [ ] Generate a hook script under a Hyper userData subdirectory. Load it after profiles through safe startup argument augmentation without changing process.env.
- [ ] Capture the post-profile CommandNotFoundAction delegate, invoke it first, and emit only when neither Command nor CommandScriptBlock is resolved; preserve throws and fail closed if the user replaces the wrapper at runtime.
- [ ] Capture the complete submitted line plus PowerShell HistoryId when available and emit a versioned nonce-tagged private OSC frame with bounded UTF-8/base64, window/session identity, reason, and callback ID.
- [ ] Implement a chunk-safe parser before DataBatcher; because the hook precedes PowerShell's error, hold the semantic event until subsequent visible bytes have been synchronously flushed, and cancel it after 250 ms without visible bytes.
- [ ] Make install/cleanup/re-init idempotent and coalesce callbacks by window/session + HistoryId + line (100 ms fallback only when HistoryId is absent), while allowing an intentional later repeat of the same line.
- [ ] Add test/unit/nli-shell-integration.test.ts and availability-gated real node-pty fixtures for PowerShell 5.1/7.

## Tests and verification

- [ ] Unit fixtures cover shell detection, safe/conflicting args, Unicode/base64, wrong nonce, malformed/oversized/truncated frames, every chunk boundary, duplicate event IDs, byte ordering, and byte preservation.
- [ ] Availability-gated node-pty fixtures prove PowerShell 5.1/7 profiles/prompts load, valid command emits none, missing command emits once after visible error, multicast/prior resolver/throw/runtime replacement semantics fail safely, repeated lookup candidates coalesce, intentional same-line repeats do not, and two sessions isolate nonces.
- [ ] Explicit negatives cover cmd /c exit 1, git diff --exit-code, false-equivalents, syntax errors, child output resembling markers, and unsupported shells.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-shell-integration.test.ts
- [ ] Run: pnpm lint
