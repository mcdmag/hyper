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
