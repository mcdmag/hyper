
# Task 05: Validate proposals and make approval immutable

## In plain English

Treat model output as untrusted text, show uncertainty honestly, and ensure the command that runs is exactly the command the user reviewed.

## Work

- [ ] Define a strict versioned JSON schema with bounded summary and one-to-three options; each option has stable ID, label, rationale, assumptions, one exact shell-native payload, and purpose.
- [ ] Reject additional properties, NUL/control characters, embedded newlines, oversized/empty fields, and prose outside the schema.
- [ ] Add local secret-pattern screening before transmission; first use discloses exact fields and secret-looking input requires explicit share consent or is refused.
- [ ] Implement deterministic local risk classification for deletion, broad staging, elevation, network effects, redirection, encoded PowerShell, Invoke-Expression, pipelines, compounds, and obfuscation.
- [ ] Store normalized plans only in main and digest session UID, attempt, shell, cwd, original input, option, exact payload, and edit revision.
- [ ] Implement atomic approval transitions: main resolves opaque IDs, rejects stale/mismatched/replayed/consumed IDs, requires fresh approval after edits, and requires a second deliberate high-risk confirmation.
- [ ] Add test/unit/nli-command-plan.test.ts with schema, privacy, risk, transition, digest-revision, replay, and race fixtures.

## Acceptance

- [ ] Malformed/adversarial/oversized model output cannot reach Session.write.
- [ ] Reject/cancel/replay writes nothing.
- [ ] Editing changes the digest and invalidates old approval.
- [ ] Session/cwd/shell/new-attempt changes invalidate the plan.
- [ ] Main, not renderer, supplies exact bytes for execution.
- [ ] Companion tests cover all UDC-2 approval and privacy decisions.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-command-plan.test.ts
- [ ] Run: pnpm lint
