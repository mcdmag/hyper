# Final feature verification

Verified on Windows x64 on 2026-07-22 against the final unpacked application built from the feature branch.

## Automated gates

- `pnpm test`: passed lint and 114 unit/integration tests. The suite includes executable PowerShell 7 and Windows PowerShell 5.1 node-pty seams, 10,000-dispatch latency tests, provider cold-path assertions, anti-spoofing, pane isolation, absolute PowerShell-path renderer support, immutable approval, single-write-attempt behavior, and cross-window Privacy Reset/Logout fanout.
- `pnpm run build`: passed Webpack and both TypeScript builds.
- `pnpm exec electron-builder --win dir --x64 --publish never`: passed and produced `dist/win-unpacked/Hyper.exe`.
- `pnpm test:e2e`: passed 8 packaged Electron scenarios covering disabled setup, unsupported-shell guidance, privacy and fixture-backed ChatGPT sign-in, alternatives, clarification, edit/reapproval, high risk, cancellation, explicit retry, malformed output, stale input/cwd, original-PTY execution, focus recovery, failure states, and the 320px panel layout.
- `scripts/test-nli-packaged.ps1`: passed. `packaged-smoke.json` records one root GUI window, no child top-level windows, exact feature-binary child ownership, untouched real Hyper/Codex directories, exited descendants, and removal of the validated temporary directory.

## Visual comparison

- Desktop disabled setup: 1.36% differing pixels from the approved mockup (2% limit).
- Narrow single proposal at 320x720: 1.83% differing pixels from the approved mockup (2% limit).
- The paired mockup/built/diff images are committed beside this report.
- Packaged screenshots record successful original-terminal handoff, explicit generated-command failure recovery, and the unknown-write outcome with no retry.

## Isolation

The E2E provider is activated only by a repository-fixture JSONL path supplied through `HYPER_NLI_E2E_FIXTURE`. It returns proposal data only and still traverses privacy, authentication, validation, risk, and approval gates. The fixture variable is removed from the PTY environment. No live account is needed for CI; optional live OAuth prerequisites remain documented in `human-setup.md`.
