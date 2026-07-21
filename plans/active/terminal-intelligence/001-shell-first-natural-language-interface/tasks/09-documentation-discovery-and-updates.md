
# Task 09: Discover and update documentation

## In plain English

Find every place users and maintainers need to understand the feature, then document the real support and privacy boundaries without overpromising.

## Work

- [ ] Re-scan README.md, PLUGINS.md, config examples/schema, contribution/test guidance, release/changelog conventions, and packaging docs after implementation; record applicable/not-applicable results.
- [ ] Add docs/natural-language-interface.md covering shell-first behavior, exact config defaults, PowerShell setup, support matrix, privacy, sign-in/logout, Codex path, options/edit/approval, errors, and troubleshooting.
- [ ] Document that valid nonzero commands never trigger, cmd.exe/WSL/arbitrary shells fail closed, and no output regex fallback exists.
- [ ] Document app-server isolation, keyring-only credentials, no token handling/tools/file reads, threat-model exclusions, diagnostics redaction, and logout semantics.
- [ ] Add developer protocol diagrams, exact test commands, fake provider usage, shell-adapter contract, and protocol-version update steps.
- [ ] Include the rollback kill switch and PR base requirement: target dev explicitly, not canary.

## Acceptance

- [ ] Documentation matches implemented behavior and screenshots/mockups.
- [ ] All discovered doc surfaces are updated or explicitly recorded as not applicable.
- [ ] Commands and support matrix are verified against the built app.

## Verify

- [ ] Run: pnpm lint
- [ ] Run: rg -n "naturalLanguageInterface|PowerShell|cmd.exe|Codex|privacy|rollback|dev" README.md docs typings/config.d.ts app/config/config-default.json
