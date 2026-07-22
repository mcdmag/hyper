# Delivery summary

## Outcome

The feature branch implements an opt-in shell-first natural-language fallback for Hyper. Valid commands and ordinary nonzero exits stay on the original synchronous PTY path with zero provider work. An authoritative PowerShell command-not-found event can open a per-pane Codex proposal flow; the user must select or edit, review, and approve before main writes the accepted command once to the same terminal.

Codex uses the official app-server browser login path through a hidden main-process child. Hyper supplies a private, tool-free configuration, keyring-only credentials, an empty cwd, a newly allowlisted environment, strict structured output, and no token transport. Multiple options, clarification, stale/replay rejection, deterministic risk labels, second confirmation, cancellation, offline/malformed states, generated-command recursion suppression, and cross-window privacy/logout revocation are implemented.

The Windows package opens as one GUI application. The packaged smoke found no child top-level window, console window, surviving descendant, real Hyper/Codex profile mutation, or unremoved validated temporary directory.

## Final verification

- `pnpm test`: passed lint and 113 unit/integration tests.
- `pnpm run build`: passed Webpack and TypeScript production builds.
- `pnpm exec electron-builder --win dir --x64 --publish never`: produced the final `dist/win-unpacked/Hyper.exe`.
- `pnpm test:e2e`: passed 8 real Electron journeys.
- `scripts/test-nli-packaged.ps1`: passed the isolated one-app/no-dangling-process smoke.
- Cue proof: 10 obligations verified, 0 pending; desktop and 320 px visual diffs remain below 2%.

The optional live OAuth smoke was not used as an automated gate because it requires an interactive browser account and intentionally writes an OS-keyring credential. Deterministic coverage exercises signed-out, login success/cancel/logout, HTTPS-only URLs, non-refreshing account-status reads, token redaction, keyring failure, 401, rate limit, timeout, crash/restart, and protocol incompatibility without touching the user's account. Session-token refresh remains owned by Codex during use; Hyper never requests, reads, or transports those credentials.

## Correctness-deferred adapters

PowerShell 5.1 and 7 are the only automatic adapters delivered. `cmd.exe`, WSL/SSH/tmux inner shells, bash, zsh, fish, and arbitrary REPLs stay unchanged because they do not yet have an adapter proven to emit authoritative unresolved-command semantics while preserving startup/profile behavior. No output-text regex or exit-code heuristic was added.

## Delivery contents

- Implementation: `app/nli/`, `app/session.ts`, `app/ui/window.ts`, typed RPC/config, and the per-pane renderer workflow.
- Tests: `test/unit/nli-*.test.ts`, `test/index.ts`, deterministic fixtures, latency checks, and packaged smoke.
- Documentation: `README.md` and `docs/natural-language-interface.md`.
- Proof: `proof/manifest.json` and `proof/artifacts/task08/`.

The branch is prepared for an explicit pull request to `dev`; publication, merge verification, and the primary-worktree fast-forward are performed as the final delivery operation.
