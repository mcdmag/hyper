# Task 00: Confirm failure scope and success contract

## In plain English

Reproduce the installed-Codex failure and record success before changing behavior. Confirm current app-server supports initialization, config inspection, account status, and browser login start while Hyper rejects startup. Keep probes redacted and cancel any login flow.

## Work

- [ ] Capture installed version/executable and reproduce provider incompatibility.
- [ ] Probe only initialize, config, account read, and login-start structure; log no secrets.
- [ ] Identify the exact 0.145 response collision and success/failure criteria.
- [ ] Cancel probe processes and login attempts.

## Acceptance

- [ ] Root cause is provider startup validation, not missing auth methods.
- [ ] Installed CLI proves required methods without completing OAuth or exposing secrets.

## Verify

- [ ] Run `codex --version` and record the installed executable version without any account data.
- [ ] Run `codex app-server --help | Select-String 'stdio|strict-config|generate-json-schema'` and confirm the required app-server surfaces are present.
- [ ] Run `rg -n "MINIMUM_CODEX_VERSION|collectValues|experimentalFeature/list|cli_auth_credentials_store" app/nli/codex-app-server.ts test/unit/nli-codex-app-server.test.ts` and cite the pre-fix startup gates in the task completion evidence.
