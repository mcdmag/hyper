
# Task 05: Validate proposals and make approval immutable

## In plain English

Treat model output as untrusted text, show uncertainty honestly, and ensure the command that runs is exactly the command the user reviewed.

## Work

- [x] Define a strict versioned response union: kind=plan with bounded summary and one-to-three command options, or kind=clarification with one bounded question and two-to-three answer choices. A plan option has stable ID, label, rationale, assumptions, one exact shell-native payload, and purpose.
- [x] Reject additional properties, NUL/control characters, embedded newlines, oversized/empty fields, and prose outside the schema.
- [x] Add local secret-pattern screening before transmission; versioned per-install first use discloses exact fields and optional cwd/Git metadata, secret-looking input requires explicit share consent or is refused, and reset revokes consent/cancels active turns.
- [x] Implement deterministic local risk classification for deletion, broad staging, elevation, network effects, redirection, encoded PowerShell, Invoke-Expression, pipelines, compounds, and obfuscation.
- [x] Store normalized plans only in main and digest session UID, attempt, shell, cwd, original input, option, exact payload, and edit revision.
- [x] Implement atomic approval transitions: main resolves opaque IDs, rejects stale/mismatched/replayed/consumed IDs, requires fresh approval after edits, and requires a second deliberate high-risk confirmation.
- [x] Add test/unit/nli-command-plan.test.ts with schema, privacy, risk, transition, digest-revision, replay, and race fixtures.

## Acceptance

- [x] Malformed/adversarial/oversized model output cannot reach Session.write.
- [x] Reject/cancel/replay writes nothing.
- [x] Editing changes the digest and invalidates old approval.
- [x] Session/cwd/shell/new-attempt changes invalidate the plan.
- [x] Main, not renderer, supplies exact bytes for execution.
- [x] Companion tests cover all UDC-2 approval and privacy decisions.

## Verify

- [x] Run: pnpm exec ava test/unit/nli-command-plan.test.ts
- [x] Run: pnpm lint
