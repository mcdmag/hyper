
# Task 02: Add authoritative PowerShell failure events

## In plain English

Teach supported PowerShell sessions to report a real unresolved command lookup while leaving all user input and ordinary output on Hyper's original path.

## Work

- Implement shell-family/argument detection for pwsh.exe and powershell.exe. Instrument only interactive sessions; refuse -File, -Command, -EncodedCommand, unknown conflicting args, cmd.exe, wsl.exe, git-cmd.exe, and arbitrary shells.
- Generate a hook script under a Hyper userData subdirectory. Load it after profiles through safe startup argument augmentation without changing process.env.
- Wrap and preserve any existing CommandNotFoundAction. Emit only when the previous handler has not resolved Command or CommandScriptBlock.
- Capture the complete submitted PowerShell line and emit a versioned nonce-tagged private OSC frame containing bounded UTF-8/base64 data, session identity, reason, and event ID.
- Implement a chunk-safe bounded parser before Session's DataBatcher. Strip only valid own frames, preserve all other bytes exactly, and emit typed shell semantic events.
- Clean up generated scripts and make setup failures leave the original shell args untouched.

## Tests and verification

- Unit: shell detection, safe/conflicting args, Unicode/base64, wrong nonce, malformed/oversized/truncated frames, every chunk boundary, duplicate event IDs, and byte preservation.
- Real node-pty seam where installed: PowerShell 5.1 and 7 profiles/prompts load; valid command emits none; missing command emits once; existing resolver suppresses fallback; two sessions isolate nonces.
- Explicit negatives: cmd /c exit 1, git diff --exit-code, false-equivalents, syntax errors, child output resembling markers, and unsupported shells never trigger.
- pnpm lint and pnpm test:unit pass.
