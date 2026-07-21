
# Task 06: Build the per-pane NLI review experience

## In plain English

Implement the mockup as a small accessible recovery panel that keeps terminal output visible and never makes execution accidental.

## Work

- [ ] Add NLI actions/reducer/selectors keyed by session UID and connect typed main events in lib/index.tsx.
- [ ] Mount NliPanel in the originating term group matching docs/mockups/nli-shell-first.html.
- [ ] Implement every privacy, unsupported-shell, auth, interpreting, option, edit, validation, approval, stale, retry, and dismiss state from the mockup.
- [ ] Use native button/radio/textarea semantics, labelled non-modal dialog, polite aria-live, visible focus, text risks, reduced motion, selectable/wrapping commands, and narrow-pane layout.
- [ ] Do not focus Run on open; Escape cancels/restores xterm; inactive panes do not steal focus; terminal Ctrl+C semantics resume after execution.
- [ ] Render all provider/model text as text, never HTML.
- [ ] Add test/unit/nli-renderer.test.tsx and deterministic E2E coverage in test/index.ts using the fake provider.

## Tests and verification

- [ ] Reducer tests cover every legal transition, option selection, edits, stale invalidation, auth/offline retry, and pane isolation.
- [ ] Component/E2E tests cover keyboard navigation, labels/live announcements, focus restore, narrow/inactive panes, visual screenshot comparison, and no accidental Enter execution.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-renderer.test.tsx
- [ ] Run: pnpm lint
- [ ] After the unpacked app exists, run: pnpm test:e2e
