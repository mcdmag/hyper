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
5. Add a redacted live-provider smoke script that loads the compiled provider, calls only `getAuthStatus()` against the installed Codex executable, prints only `signed-out` or `signed-in`, and always disposes its private temporary user-data directory.
6. Update documentation to describe capability compatibility without a numeric minimum-version promise.
7. Validate focused/full tests, a real installed-Codex provider probe, production build/package smoke, and relaunched packaged Hyper.

## State contracts

| Boundary | Input | Required result |
| --- | --- | --- |
| Initialize | Any object returned by `initialize`, with arbitrary or absent version branding | Continue to capability validation; never decide compatibility from `userAgent` or semver text |
| Effective config | `config/read.config` | Keyring storage, approval `never`, read-only sandbox, web disabled, and every present required feature explicitly false |
| Legacy config | An effective field is absent and its targeted layer/list representation is available | Inspect only explicit legacy containers and prove the missing state; never use fallback to override a present unsafe or wrong-typed effective value |
| Metadata | Origins, provenance, extra fields | Ignore outside supported configuration containers |
| Failure | Missing, malformed, unsafe, contradictory, unsupported capability | Fail closed before auth/interpretation |
| Ready provider | Proven isolation plus supported methods | Existing `NliProvider` semantics stay unchanged |

The provider passes `emptyCwd` unchanged from private runtime-directory creation into `config/read` and later thread startup. `config/read` transforms only protocol response data into a readiness decision; no credential, token, stderr, provenance object, or raw JSON-RPC payload is passed to `NliService` or the renderer. A required feature present in effective `config.features` with any value other than `false` rejects startup; the legacy feature list may prove only required keys that are absent from the effective map.

## Protocol contract

No HTTP endpoint, renderer RPC, public TypeScript interface, or user configuration schema changes. The internal JSON-RPC startup contract remains:

| Method | Request | Accepted response |
| --- | --- | --- |
| `initialize` | `{clientInfo: {name: string, title: string, version: string}, capabilities: {experimentalApi: true}}` | Any object; `userAgent` is diagnostic metadata and is not required or parsed for compatibility |
| `config/read` | `{cwd: string, includeLayers: true}` | Object containing `config`; effective safety values are checked by exact key, with targeted legacy layer fallback only for absent fields |
| `experimentalFeature/list` | `{limit: 200}` | Requested only when one or more required feature keys are absent from effective `config.features`; `data` must explicitly mark each missing required feature `enabled: false` |
| `account/read` | `{refreshToken: false}` | Existing `{account: object|null, requiresOpenaiAuth: boolean}` contract, unchanged |

JSON-RPC method-not-found, malformed response, unproven feature state, or an unsafe effective value maps to the existing `NLI_CODEX_INCOMPATIBLE` error. No HTTP status codes are involved.

The GitHub delivery contract is explicit: push `feature/terminal-intelligence/003-codex-provider-capability-negotiation`, create the PR with `--base dev`, merge that PR into `dev`, then fetch and fast-forward the primary `E:\repo\hyper` checkout while it remains on `dev`. No generated review command targeting `main` is part of this plan.

## Integration surface

- `app/ui/window.ts` remains the sole production constructor and injects through `NliService.providerFactory`.
- `app/nli/service.ts` calls `getAuthStatus()`, `login()`, and `interpret()` through `NliProvider`; `app/nli/window-coordinator.ts` and renderer RPC handlers keep using `NliService`, so no alternate Codex compatibility path exists.
- `typings/nli.d.ts` and renderer continue to depend only on `NliProvider`; no RPC, preference, schema, or UI state changes.
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
- No new configuration keys or defaults; existing installations migrate automatically because their `naturalLanguageInterface` config is read unchanged.

## Error, logging, and telemetry

Compatibility failures throw the existing typed `NliProviderError` with `NLI_CODEX_INCOMPATIBLE`. `NliService` converts it to the existing safe renderer error and, for attempt failures, emits the existing `NliDiagnostic` at `error` severity with only code, component, and correlation ID. The provider must not add console/file logging, telemetry, stderr forwarding, or raw protocol capture. No new telemetry is needed because this changes a private startup decision without adding an observable product event, and existing safe diagnostics already report failure.

## Authentication threat model

The change addresses false rejection caused by untrusted metadata key collisions while continuing to reject plaintext credential stores, enabled tools/features/web search, permissive approval or sandbox state, malformed capability data, non-HTTPS OAuth URLs, token/stderr leakage, and unexpected server requests. It does not address a malicious user-configured Codex executable, a compromised renderer/plugin/operating system/keyring, browser phishing, or upstream Codex account compromise; those boundaries remain unchanged and out of scope.

## CLI, config, and deployment surfaces

Hyper adds no CLI flag or argv parser. The spawned command remains exactly:

```text
codex app-server --stdio --strict-config
```

Hyper adds no config key, changes no default, and requires no migration or prompt. No CI workflow or deploy pipeline changes; the dry-run is the existing local production build, Windows directory package, deterministic packaged NLI smoke, and relaunch path named in Task 07.

## Rollback

Resolve the merged PR's commit with `gh pr view --json mergeCommit --jq '.mergeCommit.oid'`, revert that commit on `dev`, rerun the Task 07 build/package smoke, and redeploy the reverted package. The change writes no new user data and does not rewrite Codex credentials, so rollback requires no schema down-migration or keyring cleanup; `naturalLanguageInterface.enabled = false` remains the immediate kill switch.

## Files expected

- `app/nli/codex-app-server.ts`
- `test/unit/nli-codex-app-server.test.ts`
- `scripts/test-nli-codex-provider.cjs`
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
- Run `node scripts/test-nli-codex-provider.cjs "$((Get-Command codex).Source)"` after `pnpm run build`; require exactly `signed-out` or `signed-in` and no account label, token, URL, stderr, or raw JSON-RPC output.
- Rebuild/package Hyper, run packaged NLI smoke, relaunch for user testing.
- Commit only intended files, create/merge PR into `dev`, fast-forward local and remote `dev`, and confirm deployed executable comes from merged source.
- A task completes only with direct source, test, documentation, or git evidence. Implementation commits include `Spec-ref: 003-codex-provider-capability-negotiation`. Final delivery requires the real installed Codex probe, packaged relaunch, merged PR, and verified local/remote dev ancestry.
