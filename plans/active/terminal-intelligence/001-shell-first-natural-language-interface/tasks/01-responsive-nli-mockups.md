
# Task 01: Build responsive interaction mockups

## In plain English

Create a concrete browser-openable design reference for every NLI state before implementing the React panel.

## Work

- Add docs/mockups/nli-shell-first.html with normal-pane and narrow-split variants.
- Cover first-use privacy disclosure plus Codex sign-in, interpreting/cancel, single proposal, three alternatives, edited/high-risk confirmation, unsupported shell, offline/rate-limit, malformed response, and stale-context states.
- Use native buttons, radio groups, labels, textarea, live-region examples, visible focus, text-plus-color risk communication, reduced-motion behavior, and wrapping/selectable command text.
- Match Hyper's existing typography/colors while keeping terminal output visible.
- Document keyboard order: focus panel heading, Tab/Shift+Tab, arrow-key radio selection, Escape cancel/focus restore, and no Enter-to-run on open.

## Acceptance

- The standalone HTML is responsive at 320px and desktop pane widths.
- Every action and state in vision.md is represented.
- Contrast/focus/semantic controls can be inspected without a build.
- The implementation tasks cite this artifact as the visual source.
