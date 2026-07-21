
# Task 07: Execute approved text once through the original PTY

## In plain English

After approval, feed the exact reviewed PowerShell payload back into the same live shell so aliases, cwd, environment, prompts, and streamed output behave like normal Hyper.

## Work

- [ ] Add typed renderer approval/edit/cancel RPC in app/ui/window.ts with sender/session validation.
- [ ] Resolve opaque approval from main's immutable plan, re-read session/shell/cwd/attempt, rerun gates, and atomically consume before writing.
- [ ] Write stored exact payload plus PowerShell Enter exactly once through Session.write/node-pty; never use exec, execFile, a second terminal, or a Codex tool.
- [ ] Set/clear recursion-suppression origin around the generated attempt.
- [ ] Restore terminal focus and stream echo/output through the unchanged data path.
- [ ] Handle closed PTY, write error, replay, newer command, stale cwd, and shutdown without a partial second write.
- [ ] Add test/unit/nli-execution.test.ts with fake Session and adversarial renderer fixtures.

## Acceptance

- [ ] Approved payload reaches Session.write exactly once and is visibly echoed/executed in the original session.
- [ ] Renderer-tampered text cannot change stored command bytes.
- [ ] Replay, stale context, reject, cancel, and provider tool requests write zero bytes.
- [ ] Generated lookup failure produces normal output and explicit retry UI, not recursive AI.
- [ ] Existing interactive/menu/startup sendSessionData paths remain unchanged in regression tests.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-execution.test.ts
- [ ] Run: pnpm lint
