
# Task 07: Execute approved text once through the original PTY

## In plain English

After approval, feed the exact reviewed PowerShell payload back into the same live shell so aliases, cwd, environment, prompts, and streamed output behave like normal Hyper.

## Work

- [x] Add typed renderer approval/edit/cancel RPC in app/ui/window.ts with windowId, sender webContents identity, session, attempt, plan, option, and revision validation.
- [x] Resolve opaque approval from main's immutable plan, re-read every context field, rerun gates, atomically consume, then make one synchronous Session.write call with no intervening await.
- [x] Write stored exact payload plus PowerShell Enter with one synchronous, non-retried Session.write attempt; never use exec, execFile, a second terminal, or a Codex tool.
- [x] Set/clear recursion-suppression origin around the generated attempt.
- [x] Restore terminal focus and stream echo/output through the unchanged data path.
- [x] Handle closed PTY, synchronous write error, replay/duplicate click, stale renderer/window, newer command, stale cwd, and shutdown with zero retry after consumption; report unknown shell execution outcome honestly.
- [x] Add test/unit/nli-execution.test.ts with fake Session and adversarial renderer fixtures.

## Acceptance

- [x] Approved payload causes one synchronous Session.write attempt and is visibly echoed/executed in the original session in the success fixture; tests do not claim execution after a PTY failure.
- [x] Renderer-tampered text cannot change stored command bytes.
- [x] Replay, stale context, reject, cancel, and provider tool requests write zero bytes.
- [x] Generated lookup failure produces normal output and explicit retry UI, not recursive AI.
- [x] Existing interactive/menu/startup sendSessionData paths remain unchanged in regression tests.

## Verify

- [x] Run: pnpm exec ava test/unit/nli-execution.test.ts
- [x] Run: pnpm lint
