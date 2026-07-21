
# Task 09: Discover and update documentation

## In plain English

Find every place users and maintainers need to understand the feature, then document the real support and privacy boundaries without overpromising.

## Work

- Re-scan README.md, PLUGINS.md, config examples/schema, contribution/test guidance, release notes/changelog conventions, and packaging docs after implementation.
- Add docs/natural-language-interface.md covering shell-first behavior, enablement, configuring/opening PowerShell on Windows, supported/unsupported shells, privacy fields, browser sign-in/logout, Codex CLI requirement/path, multiple options, editing/approval, high-risk confirmation, offline/errors, and troubleshooting.
- Document that valid nonzero commands never trigger, cmd.exe/WSL/arbitrary shells fail closed, and no output regex fallback exists.
- Document app-server isolation, keyring-only credentials, no token handling, no tools/file reads, and what logout means.
- Add developer protocol diagrams, test commands, fake provider usage, extension contract for future shell adapters, and protocol-version update steps.
- Include the PR base requirement: target dev explicitly, not canary.

## Acceptance

- Documentation matches implemented behavior and screenshots/mockups.
- All discovered doc surfaces are updated or explicitly recorded as not applicable.
- Commands and support matrix are verified against the built app.
