# Codex provider capability negotiation

## Problem

Hyper rejects installed Codex CLI 0.145 before login even though its app-server initialization, account methods, and isolation controls remain compatible. The provider recursively searches the full `config/read` response for `cli_auth_credentials_store`; 0.145 added an `origins.cli_auth_credentials_store` provenance object, so Hyper mistakes metadata for unsafe effective configuration. Startup is also coupled to a parsed minimum version string and always calls an experimental feature-list method even when effective config proves feature state.

## Root cause

`CodexAppServerProvider.start()` uses version text and response layout as capability proxies. Its `collectValues()` helper gathers effective settings, layer data, and unrelated provenance fields with the same key. The isolation check rejects a safe 0.145 response, maps it to `NLI_CODEX_INCOMPATIBLE`, and prevents `account/login/start`.

## Change

1. Remove the minimum-version/user-agent gate. A valid initialize response continues to method and security-capability validation.
2. Replace recursive scanning with explicit effective-state inspection. Prefer `config.cli_auth_credentials_store`; when absent, inspect only `layers[*].config.cli_auth_credentials_store` as the legacy representation. Wrong-typed, unsafe, contradictory, missing, or unprovable values fail closed.
3. Validate approval policy, read-only sandbox, disabled web search, and dangerous features from effective `config/read`. When all required `config.features` keys are explicitly false, do not depend on `experimentalFeature/list`; otherwise use that method only as the tested 0.144.6 fallback.
4. Add regression tests for the installed 0.145 shape, provenance collisions, version independence, effective precedence, legacy fallback, and fail-closed malformed/unsafe cases.
5. Update documentation to describe capability compatibility without a numeric minimum-version promise.
6. Validate focused/full tests, a real installed-Codex provider probe, production build/package smoke, and relaunched packaged Hyper.

## State contracts

| Boundary | Input | Required result |
| --- | --- | --- |
| Initialize | Response with arbitrary version branding | Continue on valid object; never decide compatibility from semver text alone |
| Effective config | `config/read.config` | Keyring storage, approval `never`, read-only sandbox, web disabled, required features explicitly false |
| Legacy config | Modern fields absent; layers/list available | Inspect only explicit legacy containers and prove the same state |
| Metadata | Origins, provenance, extra fields | Ignore outside supported configuration containers |
| Failure | Missing, malformed, unsafe, contradictory, unsupported capability | Fail closed before auth/interpretation |
| Ready provider | Proven isolation plus supported methods | Existing `NliProvider` semantics stay unchanged |

## Integration surface

- `app/ui/window.ts` remains the sole production constructor and injects through `NliService.providerFactory`.
- `NliService` and renderer continue to depend only on `NliProvider`; no RPC, preference, schema, or UI state changes.
- `app/nli/codex-app-server.ts` owns compatibility negotiation and safety validation.
- `test/unit/nli-codex-app-server.test.ts` proves modern, legacy, and fail-closed cases.
- `test/fixtures/nli/codex-app-server-0.144.6-v2-subset.json` remains the legacy contract fixture.
- `docs/natural-language-interface.md` documents the compatibility contract.

## Decisions

- Capability validation replaces version gating; no version allowlist.
- Effective config is authoritative; metadata is never recursively searched.
- Legacy support is one narrow fallback, not a per-version adapter framework.
- Security is never inferred from defaults; every required capability must be explicit.
- No visual mockup or UI task because visible surfaces do not change.
- No telemetry or raw protocol logging.
- Rollback is a normal revert; no user-data migration or credential rewrite.

## Files expected

- `app/nli/codex-app-server.ts`
- `test/unit/nli-codex-app-server.test.ts`
- `docs/natural-language-interface.md`

## Out of scope

- Relaxing private CODEX_HOME, keyring-only storage, sandbox, web/tool/feature controls, or server-request denial.
- Reusing normal Codex config, plugins, skills, MCP servers, tokens, or project settings.
- Provider auto-update, non-Codex providers, command-plan schema changes, or NLI panel redesign.
- Automating external browser OAuth completion in CI.

## Verification

- Focused AVA tests cover modern provenance, arbitrary user-agent text, legacy fallback, unsafe/missing/malformed values, enabled features, method failures, and auth/login behavior.
- `pnpm exec ava test/unit/nli-codex-app-server.test.ts`
- `pnpm run lint`
- `pnpm exec tsc -b --pretty false`
- `pnpm run test:unit`
- `pnpm run build`
- Invoke the compiled real provider with installed Codex; `getAuthStatus()` returns signed-out or signed-in rather than incompatible without exposing secrets.
- Rebuild/package Hyper, run packaged NLI smoke, relaunch for user testing.
- Commit only intended files, create/merge PR into `dev`, fast-forward local and remote `dev`, and confirm deployed executable comes from merged source.

## Verification

A task completes only with direct source, test, documentation, or git evidence. Implementation commits include `Spec-ref: 003-codex-provider-capability-negotiation`. Final delivery requires the real installed Codex probe, packaged relaunch, merged PR, and verified local/remote dev ancestry.
