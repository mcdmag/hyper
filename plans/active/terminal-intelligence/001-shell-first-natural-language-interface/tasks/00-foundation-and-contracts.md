
# Task 00: Establish contracts, configuration, and seams

## In plain English

Define the feature's vocabulary and off-by-default configuration before wiring behavior, so every later task shares one typed contract and existing Hyper behavior remains the baseline.

## Work

- Add shared NLI types for shell semantic events, attempts, auth/privacy states, structured plans/options, local risks, display-safe renderer state, and opaque approval requests.
- Add an opt-in configuration block to typings/config.d.ts and app/config/config-default.json with enabled, Codex executable path, timeout/input/option bounds, and privacy settings. Regenerate app/config/schema.json.
- Define ShellIntegrationAdapter and NliProvider interfaces without implementing provider behavior.
- Extend typings/common.d.ts and constants with typed event names, keeping secrets and authoritative command bytes out of renderer requests.
- Add injectable clock, child-process factory, nonce source, and fake provider seams for deterministic tests.
- Record baseline call graph assertions for all sendSessionData and Session.write callers.

## Acceptance

- Default configuration produces byte-for-byte current session startup and no NLI objects/processes.
- Types make session UID, attempt ID, plan ID, and option ID non-interchangeable.
- Renderer approval cannot carry command text.
- pnpm run generate-schema, pnpm lint, and focused unit tests pass.
