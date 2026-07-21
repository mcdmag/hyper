# Blindspot pass

No user-confirmed blindspot transcript was added to goal context because this run is autonomous. These findings are incorporated into tasks and reviews.

## High impact

- Hyper's Windows default shell is cmd.exe when shell is unset. cmd.exe lacks an authoritative hook, so automatic support requires a PowerShell profile/session. Documentation and unsupported-shell UI must make this explicit.
- app-server is experimental and versioned. Capability checks, generated-schema fixtures, and a provider adapter are required.
- User Codex configuration may contain tools/hooks/MCP/project instructions. A dedicated hardened CODEX_HOME is required; sharing the default home would violate proposal-only privacy.
- PowerShell startup augmentation can silently break profiles or existing CommandNotFoundAction handlers. Refuse conflicting arguments and test preservation.
- Current renderer/plugin architecture is already privileged. Do not overstate approval as a renderer-compromise boundary.

## Medium impact

- PTY OSC frames may split at any byte and malformed frames must pass through without data loss.
- Multiple lookup attempts may occur for one submitted line. Event IDs and per-session dedupe are required.
- Full cwd can be sensitive. Default disclosure should be explicit and minimized.
- A generated missing command can recurse. Origin tagging is mandatory.
- A user can keep typing during interpretation. New attempts must cancel stale plans.
- Editing command text changes the reviewed object. Reapproval and digest revision are mandatory.
- Keyring unavailability must fail closed rather than silently use plaintext tokens.
- Packaged Windows spawn defaults can open a console unless windowsHide is explicit.

## Lower impact / future

- Bash, zsh, and fish have hooks but safe startup/prior-handler preservation needs separate adapters.
- WSL/SSH/tmux obscure the inner shell and should not be inferred from the outer process.
- IME, Unicode, multiline paste, and bracketed input need explicit suppression or tests.
- Model risk labels are advisory only; deterministic local rules and clear limitations are needed.
