
# Task 08: Prove latency, safety, and packaging behavior

## In plain English

Exercise the feature across unit, PTY, renderer, and packaged-app seams so the shell-first promise is measurable rather than assumed.

## Work

- [x] Complete unit coverage for configuration, shell detection, OSC parser, controller, provider/auth, plan/privacy/risk, reducer, and atomic approval plus single-write-attempt behavior.
- [x] Add test/unit/nli-integration.test.ts with fake PTY fixtures proving visible-error ordering, anti-spoofing, pane isolation, and zero provider calls for valid/nonzero commands.
- [x] Keep PowerShell 5.1/7 node-pty seams executable-availability-gated and deterministic.
- [x] Add a test-only HYPER_NLI_E2E_FIXTURE JSONL-provider seam, inactive unless the explicit env var names a repository fixture; it may propose data only and remains behind normal approval.
- [x] Extend test/index.ts with that deterministic fake provider for privacy/auth, clarification/alternatives, edit/reapproval, high risk, cancel/retry, malformed/offline, stale cwd, focus, and execution.
- [x] Add test/unit/nli-performance.test.ts implementing the exact plan.md 10,000-dispatch budget and zero-provider/zero-await assertions.
- [x] Add scripts/test-nli-packaged.ps1 that creates a unique temp APPDATA/userData and Hyper config, sets HYPER_NLI_E2E_FIXTURE to the scripted JSONL fixture, launches dist/win-unpacked/Hyper.exe hidden, asserts the real user Hyper/Codex paths are untouched, inspects child process/window ownership, closes Hyper, asserts no child remains, and removes only the validated temp directory.
- [x] Build locally with pnpm run build and pnpm exec electron-builder --win dir --x64 --publish never; no CI/deploy workflow is changed.

## Acceptance

- [x] All vision invariants have executable evidence.
- [x] Tests are deterministic without a live OpenAI account.
- [x] Optional live OAuth smoke is documented separately and does not gate CI.
- [x] No unredacted command content appears in routine logs/test snapshots.

## Verify

- [x] Run: pnpm test
- [x] Run: pnpm run build
- [x] Run: pnpm exec electron-builder --win dir --x64 --publish never
- [x] Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-nli-packaged.ps1
- [x] Run: pnpm test:e2e
