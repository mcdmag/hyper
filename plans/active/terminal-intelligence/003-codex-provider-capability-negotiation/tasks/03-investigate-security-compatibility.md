# Task 03: Audit security invariants

## In plain English

Ensure update resilience does not loosen Hyper's isolation boundary. Review credentials, sandbox/web/tools, environment, private directories, server requests, and error redaction.

## Work

- [ ] Enumerate startup/request security invariants.
- [ ] Test design against unsafe, wrong-typed, missing, contradictory, and method-failure cases.
- [ ] Confirm no normal Codex config, secrets, plugins, raw payloads, or stderr cross boundaries.

## Acceptance

- [ ] Only proven-safe effective or legacy state is accepted.
- [ ] Unknown/unsafe state fails before auth/interpretation.

## Verify

- [ ] Run `rg -n "CODEX_APP_SERVER_CONFIG|SAFE_ENVIRONMENT_NAMES|Client capabilities disabled|stderr\\.on|https:" app/nli/codex-app-server.ts` and cite every retained isolation boundary.
- [ ] Run `pnpm exec ava test/unit/nli-codex-app-server.test.ts --match='environment construction*' --match='denies every generated*' --match='rejects non-HTTPS*'` and require all security seams to pass.
- [ ] Run `rg -n "console\\.(log|error)|auth\\.json|accessToken|\\.\\.\\.process\\.env" app/nli/codex-app-server.ts` and require no matches.
