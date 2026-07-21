
# Task 07: Execute approved text once through the original PTY

## In plain English

After approval, feed the exact reviewed PowerShell payload back into the same live shell so aliases, cwd, environment, prompts, and streamed output behave like normal Hyper.

## Work

- Add a typed renderer approval/edit/cancel RPC handled in app/ui/window.ts with sender/session validation.
- Resolve the opaque approval against main's immutable plan, re-read current session/shell/cwd/attempt, rerun local validation/risk gates, and atomically consume the approval.
- Write the stored exact payload plus the shell Enter sequence once through the existing Session.write/node-pty boundary. Do not use exec, execFile, a second terminal, or Codex tool execution.
- Set/clear the recursion-suppression origin around the generated attempt.
- Immediately restore terminal focus and stream ordinary PTY echo/output through the unchanged data path.
- Handle closed PTY, write error, duplicate/replayed approval, newer command, stale cwd, and window shutdown without partial second writes.

## Acceptance

- An approved payload reaches Session.write exactly once and is visibly echoed/executed in the original session.
- Renderer-tampered text cannot change stored command bytes.
- Replay, stale context, reject, cancel, and provider tool requests write zero bytes.
- Generated lookup failure produces normal output and explicit retry UI, not recursive AI.
- Existing interactive/menu/startup sendSessionData paths remain unchanged in regression tests.
