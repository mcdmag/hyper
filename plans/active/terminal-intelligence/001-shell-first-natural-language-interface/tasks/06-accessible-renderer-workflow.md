
# Task 06: Build the per-pane NLI review experience

## In plain English

Implement the mockup as a small accessible recovery panel that keeps terminal output visible and never makes execution accidental.

## Work

- Add NLI actions/reducer/selectors keyed by session UID and connect typed main events in lib/index.tsx.
- Mount NliPanel in the originating term group using the docs/mockups/nli-shell-first.html design.
- Implement privacy consent, unsupported-shell guidance, auth-required/sign-in/cancel/logout, interpreting/cancel, single/multiple option review, rationale/assumptions, edit, local validation, normal/high-risk approval, stale context, retry, and dismiss.
- Use native button/radio/textarea semantics, labelled non-modal dialog, polite aria-live status, visible focus, text risk labels, reduced motion, selectable/wrapping commands, and responsive narrow-pane layout.
- Do not focus Run on open. Escape cancels and restores xterm focus. Inactive panes do not steal focus. Terminal focus/Ctrl+C semantics resume immediately after execution.
- Render all provider/model text as text, never HTML.

## Tests and verification

- Reducer tests cover every state transition, option selection, edits, stale invalidation, auth/offline retry, and per-pane isolation.
- Component/E2E tests cover keyboard-only navigation, screen-reader labels/live announcements, focus restoration, narrow split panes, inactive panes, and no accidental Enter execution.
- pnpm lint, pnpm test:unit, and deterministic fake-provider E2E pass.
