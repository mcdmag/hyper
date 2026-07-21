
# Task 08: Prove latency, safety, and packaging behavior

## In plain English

Exercise the feature across unit, PTY, renderer, and packaged-app seams so the shell-first promise is measurable rather than assumed.

## Work

- [ ] Complete unit coverage for configuration, shell detection, OSC parser, controller, provider/auth, plan/privacy/risk, reducer, and atomic approval plus single-write-attempt behavior.
- [ ] Add test/unit/nli-integration.test.ts with fake PTY fixtures proving visible-error ordering, anti-spoofing, pane isolation, and zero provider calls for valid/nonzero commands.
- [ ] Keep PowerShell 5.1/7 node-pty seams executable-availability-gated and deterministic.
- [ ] Extend test/index.ts with a deterministic fake provider for privacy/auth, alternatives, edit/reapproval, high risk, cancel/retry, malformed/offline, stale cwd, focus, and execution.
- [ ] Add test/unit/nli-performance.test.ts implementing the exact plan.md 10,000-dispatch budget and zero-provider/zero-await assertions.
- [ ] Add scripts/test-nli-packaged.ps1 to launch dist/win-unpacked/Hyper.exe, inspect the Codex child process/window ownership, close Hyper, and assert no child remains.
- [ ] Build locally with pnpm run build and pnpm exec electron-builder --win dir --x64 --publish never; no CI/deploy workflow is changed.

## Acceptance

- [ ] All vision invariants have executable evidence.
- [ ] Tests are deterministic without a live OpenAI account.
- [ ] Optional live OAuth smoke is documented separately and does not gate CI.
- [ ] No unredacted command content appears in routine logs/test snapshots.

## Verify

- [ ] Run: pnpm test
- [ ] Run: pnpm run build
- [ ] Run: pnpm exec electron-builder --win dir --x64 --publish never
- [ ] Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-nli-packaged.ps1
- [ ] Run: pnpm test:e2e
