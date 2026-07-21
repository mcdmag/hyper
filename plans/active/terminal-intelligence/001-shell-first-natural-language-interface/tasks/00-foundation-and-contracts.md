
# Task 00: Establish contracts, configuration, and seams

## In plain English

Define the feature's vocabulary and off-by-default configuration before wiring behavior, so every later task shares one typed contract and existing Hyper behavior remains the baseline.

## Work

- [ ] Add shared NLI types for shell semantic events, attempts, auth/privacy states, structured plans/options, local risks, display-safe renderer state, and opaque approval requests.
- [ ] Add naturalLanguageInterface defaults exactly as specified in plan.md to typings/config.d.ts and app/config/config-default.json; regenerate app/config/schema.json.
- [ ] Define ShellIntegrationAdapter and NliProvider interfaces without implementing provider behavior.
- [ ] Extend typings/common.d.ts and constants with typed event names, keeping secrets and authoritative command bytes out of renderer requests.
- [ ] Add injectable clock, child-process factory, nonce source, and fake provider seams for deterministic tests.
- [ ] Add test/unit/nli-contracts.test.ts with default-off, branded-ID, renderer-contract, and sendSessionData/Session.write call-graph assertions.

## Acceptance

- [ ] Default configuration produces byte-for-byte current session startup and no NLI objects/processes.
- [ ] Types make session UID, attempt ID, plan ID, and option ID non-interchangeable.
- [ ] Renderer approval cannot carry command text.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-contracts.test.ts
- [ ] Run: pnpm run generate-schema
- [ ] Run: pnpm lint
