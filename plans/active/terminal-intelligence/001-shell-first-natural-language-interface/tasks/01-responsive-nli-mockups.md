
# Task 01: Build responsive interaction mockups

## In plain English

Create a concrete browser-openable design reference for every NLI state before implementing the React panel.

## Work

- [ ] Add docs/mockups/nli-shell-first.html with normal-pane and narrow-split variants.
- [ ] Cover disabled setup with exact config/Open Hyper Configuration, enabled unsupported-shell startup guidance, first-use privacy choices/reset plus Codex sign-in, keyring/userData errors, interpreting/cancel, bounded clarification, single proposal, three alternatives, edited/high-risk confirmation, offline/rate-limit, malformed response, and stale-context states.
- [ ] Add pixelmatch, pngjs, and their TypeScript declarations as dev dependencies for deterministic mockup-to-built comparison.
- [ ] Use native buttons, radio groups, labels, textarea, live-region examples, visible focus, text-plus-color risk communication, reduced-motion behavior, and wrapping/selectable command text.
- [ ] Match Hyper's existing typography/colors while keeping terminal output visible.
- [ ] Document keyboard order: focus panel heading, Tab/Shift+Tab, arrow-key radio selection, Escape cancel/focus restore, and no Enter-to-run on open.
- [ ] Add test/unit/nli-mockup.test.ts that reads the HTML and asserts every named state, semantic control, live region, reduced-motion rule, and both viewport fixtures.
- [ ] Add scripts/capture-nli-mockups.ts using Playwright Chromium to capture 320px and desktop screenshots under dist/tmp without human interaction.

## Acceptance

- [ ] The standalone HTML declares responsive layouts at 320px and desktop pane widths.
- [ ] Every action and state in vision.md is represented.
- [ ] Native controls, visible focus, and semantic labels are asserted by the fixture test.
- [ ] The implementation tasks cite this artifact as the visual source.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-mockup.test.ts
- [ ] Run: pnpm exec ts-node scripts/capture-nli-mockups.ts
