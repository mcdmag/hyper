
# Task 06: Build the per-pane NLI review experience

## In plain English

Implement the mockup as a small accessible recovery panel that keeps terminal output visible and never makes execution accidental.

## Work

- [ ] Register an always-available nli:setup renderer command and Tools -> Natural Language Setup menu item; its non-modal panel works with enabled=false and opens Hyper's existing config editor with the exact documented block.
- [ ] Add NLI actions/reducer/selectors keyed by session UID and connect typed main events in lib/index.tsx.
- [ ] Mount NliPanel in the originating term group matching docs/mockups/nli-shell-first.html.
- [ ] Implement every disabled-setup, one-time unsupported-shell startup guidance, privacy choices/reset, keyring/userData errors, auth, interpreting, bounded clarification, option, edit, validation, approval, stale, retry, and dismiss state from the mockup without classifying terminal input.
- [ ] Use native button/radio/textarea semantics, labelled non-modal dialog, polite aria-live, visible focus, text risks, reduced motion, selectable/wrapping commands, and narrow-pane layout.
- [ ] Do not focus Run on open; Escape cancels/restores xterm; inactive panes do not steal focus; terminal Ctrl+C semantics resume after execution.
- [ ] Render all provider/model text as text, never HTML.
- [ ] Add test/unit/nli-renderer.test.ts and deterministic E2E coverage in test/index.ts using the fake provider, including disabled setup and default cmd.exe guidance.

## Tests and verification

- [ ] Reducer tests cover every legal transition, option selection, edits, stale invalidation, auth/offline retry, and pane isolation.
- [ ] Component/E2E tests cover keyboard navigation, labels/live announcements, focus restore, narrow/inactive panes, clarification choices, consent reset, accessible storage/keyring errors, and no accidental Enter execution.
- [ ] Add scripts/compare-nli-visuals.ts using Playwright, pixelmatch, and pngjs. Capture mockup and built states at 320x720 and 900x720 into dist/tmp, compare same-state pairs at no more than 2% differing pixels, and keep deterministic state fixtures under test/fixtures/nli-visual/.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-renderer.test.ts
- [ ] Run: pnpm exec ts-node scripts/compare-nli-visuals.ts
- [ ] Run: pnpm lint
- [ ] After the unpacked app exists, run: pnpm test:e2e
