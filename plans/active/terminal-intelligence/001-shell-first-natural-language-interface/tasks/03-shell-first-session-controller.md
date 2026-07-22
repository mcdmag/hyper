
# Task 03: Wire the per-session shell-first lifecycle

## In plain English

Turn one authoritative shell event into one cancelable proposal request without blocking the terminal or mixing tabs.

## Work

- [ ] Add a main-only NliService/controller keyed by session UID and attempt ID.
- [ ] Implement the exact legal state transitions and state-contract fields from plan.md, including terminal cancel/error/stale/sent states.
- [ ] Wire Session semantic events through app/ui/window.ts only after ordinary error output has been emitted to the renderer.
- [ ] Snapshot failed line, shell/OS/session, cwdFingerprint, optional disclosed cwd, and consented allowlisted Git booleans/branch only; collect Git metadata after failure/consent and never collect filenames/diffs/remote URLs/scrollback/history/env/files/clipboard.
- [ ] Re-sample current cwd from the PTY process at approval and compare its normalized fingerprint to the failed-attempt fingerprint; any mismatch makes the plan stale.
- [ ] Lazy-create the provider only on a verified command-not-found event after privacy consent/auth gates.
- [ ] Dedupe repeated hooks, cancel on newer attempts/session close/window close, invalidate stale work on cwd/shell changes, and tag generated writes against recursion.
- [ ] Emit display-safe typed errors with only allowlisted redacted diagnostic metadata.
- [ ] Add test/unit/nli-service.test.ts with deterministic clock/fake provider/fake session fixtures.

## Acceptance

- [ ] Valid input and ordinary nonzero exits instantiate no provider and add no awaited work before Session.write.
- [ ] One failure creates at most one request in its own pane and visible error ordering is asserted.
- [ ] The shell remains responsive during auth/provider work.
- [ ] Closing or superseding a session aborts the request and cannot update another pane.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-service.test.ts
- [ ] Run: pnpm lint
