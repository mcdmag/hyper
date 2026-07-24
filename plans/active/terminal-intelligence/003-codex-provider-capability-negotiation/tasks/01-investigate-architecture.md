# Task 01: Map provider architecture and callers

## In plain English

Trace renderer actions to provider and errors back to the panel. Keep the fix within the existing main-process provider boundary and verify no parallel path is missed.

## Work

- [ ] Trace action, RPC, service, provider factory, startup, auth, turn, and cleanup paths.
- [ ] Find every production/test caller and affected document.
- [ ] Confirm stable provider/error contracts need no changes.

## Acceptance

- [ ] Sole constructor and all direct surfaces are listed.
- [ ] No divergent compatibility path is uncovered.

## Verify

- [ ] Run `rg -n "new CodexAppServerProvider|providerFactory|getAuthStatus\\(|\\.login\\(|\\.interpret\\(" app typings test/unit` and account for the production constructor, service calls, coordinator/RPC entry points, and test seams.
- [ ] Run `rg -n "NLI_CODEX_INCOMPATIBLE|NliProvider" app typings` and confirm the existing provider/error contracts remain the only renderer-facing boundary.
