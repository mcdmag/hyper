
# Task 08: Prove latency, safety, and packaging behavior

## In plain English

Exercise the feature across unit, PTY, renderer, and packaged-app seams so the shell-first promise is measurable rather than assumed.

## Work

- Complete unit coverage for configuration, shell detection, OSC parser, controller, provider JSONL/auth, schema validation, privacy, risk, digests, reducer, and exact-once execution.
- Add fake-PTY integration tests verifying error output precedes NLI state, arbitrary output cannot spoof a valid marker, simultaneous panes isolate state, and valid commands have zero provider calls.
- Add PowerShell 5.1/7 node-pty seam tests gated by executable availability.
- Extend Playwright/E2E with a deterministic fake provider for privacy/auth, multiple options, edit/reapproval, high risk, cancel/retry, offline/malformed response, stale cwd, split focus, and approved execution.
- Add a performance assertion/instrumentation test showing the enabled supported-shell input hot path has no AI construction/network and no awaited decision before pty.write.
- Build the production app and verify shell hook assets/config are available, Codex is spawned hidden with no dangling console, and all children/scripts clean up.
- Run pnpm lint, pnpm test:unit, pnpm run build, pnpm test:e2e, and the applicable packaged Windows target.

## Acceptance

- All vision invariants have executable evidence.
- Tests are deterministic without a live OpenAI account.
- Optional live OAuth smoke is documented separately and does not gate CI.
- No unredacted command content appears in routine logs/test snapshots.
