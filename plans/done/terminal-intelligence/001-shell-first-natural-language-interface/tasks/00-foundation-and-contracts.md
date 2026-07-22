
# Task 00: Establish contracts, configuration, and seams

## In plain English

Define the feature's vocabulary and off-by-default configuration before wiring behavior, so every later task shares one typed contract and existing Hyper behavior remains the baseline.

## Work

- [x] Add shared NLI types for shell semantic events, attempts, auth/privacy states, structured plans/options, local risks, display-safe renderer state, and opaque approval requests.
- [x] Add every naturalLanguageInterface default exactly as specified in plan.md, including includeGitMetadata=false, to typings/config.d.ts and app/config/config-default.json; regenerate app/config/schema.json.
- [x] Define versioned non-secret privacy preferences at app.getPath('userData')/nli/preferences.json with reset/revocation semantics and injectable storage.
- [x] Define ShellIntegrationAdapter and NliProvider interfaces without implementing provider behavior.
- [x] Extend typings/common.d.ts and constants with typed event names, keeping secrets and authoritative command bytes out of renderer requests.
- [x] Add injectable clock, child-process factory, nonce source, and fake provider seams for deterministic tests.
- [x] Add test/unit/nli-contracts.test.ts with default-off, branded-ID, renderer-contract, and sendSessionData/Session.write call-graph assertions.

## Acceptance

- [x] Default configuration produces byte-for-byte current session startup and no NLI objects/processes.
- [x] Types make session UID, attempt ID, plan ID, and option ID non-interchangeable.
- [x] Renderer approval cannot carry command text.

## Verify

- [x] Run: pnpm exec ava test/unit/nli-contracts.test.ts
- [x] Run: pnpm run generate-schema
- [x] Run: pnpm lint
