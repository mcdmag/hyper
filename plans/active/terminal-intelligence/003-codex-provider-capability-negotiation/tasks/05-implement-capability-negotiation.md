# Task 05: Implement and test capability negotiation

## In plain English

Replace version and recursive metadata assumptions with explicit capability checks. Make 0.145 reach auth, retain 0.144.6 fallback, and reject isolation that cannot be proven.

## Work

- [ ] Add failing tests for modern config/provenance and arbitrary user-agent versions.
- [ ] Add effective precedence, legacy fallback, unsafe/malformed/missing feature, and method-failure cases.
- [ ] Make modern fixtures include effective `config.cli_auth_credentials_store = 'keyring'`, a complete `config.features` false map, and an `origins.cli_auth_credentials_store` provenance object; assert `account/read` occurs and `experimentalFeature/list` does not.
- [ ] Exercise `login()` with that modern response shape and assert the provider reaches `account/login/start`, accepts only the existing HTTPS response contract, and preserves cancellation/completion behavior.
- [ ] Prove initialize succeeds with non-semver and absent `userAgent`; require only an object response before security-capability checks.
- [ ] Remove `MINIMUM_CODEX_VERSION`, version parsing, and recursive `collectValues`.
- [ ] In `start()`, request `config/read` first. Validate exact effective credential/safety paths; use only `layers[*].config.cli_auth_credentials_store` when the effective property is absent and require at least one declaration with every declaration equal to `keyring`.
- [ ] For each required feature, reject any present effective value other than `false`; request `experimentalFeature/list` only for required keys absent from the effective map, and require the list to prove each missing key disabled.
- [ ] Preserve lifecycle, auth, turn, environment, filesystem, denial, and error behavior.
- [ ] Add `scripts/test-nli-codex-provider.cjs`. It must load the compiled provider, accept the executable path as its sole argument, create a unique temporary user-data directory, call only `getAuthStatus()`, print only the status enum, reject any status other than `signed-out` or `signed-in`, and dispose/remove temporary state in `finally`. It must never print account labels, errors, stderr, URLs, tokens, or JSON-RPC payloads.

## Acceptance

- [ ] Modern fixture reaches account/read without experimental list when effective features are complete.
- [ ] Modern fixture reaches `account/login/start` without a version or provenance-layout rejection.
- [ ] Metadata/version branding do not decide compatibility.
- [ ] Legacy fixture passes; unsafe/unproven state fails closed.
- [ ] No public API or UI surface changes.

## Verify

- [ ] Run `pnpm exec ava test/unit/nli-codex-app-server.test.ts` and require every provider/auth/isolation regression to pass.
- [ ] Run `rg -n "MINIMUM_CODEX_VERSION|supportsMinimumVersion|parseVersion|collectValues" app/nli/codex-app-server.ts` and require no matches.
- [ ] Run `rg -n "experimentalFeature/list|config/read|account/read" test/unit/nli-codex-app-server.test.ts` and confirm tests assert modern request ordering/no-list behavior plus legacy fallback.
- [ ] Run `pnpm run build` followed by `node scripts/test-nli-codex-provider.cjs "$((Get-Command codex).Source)"`; require exactly `signed-out` or `signed-in` and verify the script removes its unique temporary directory.
