
# Task 05: Validate proposals and make approval immutable

## In plain English

Treat model output as untrusted text, show uncertainty honestly, and ensure the command that runs is exactly the command the user reviewed.

## Work

- Define a strict versioned JSON schema with bounded summary and one-to-three options. Each option has stable ID, label, rationale, assumptions, one exact shell-native payload, and purpose. Reject additional properties, NUL/control characters, embedded newlines, oversized values, empty options, and prose outside the schema.
- Add local secret-pattern screening before transmission. First use discloses exact fields; secret-looking failed input requires explicit share consent or is refused.
- Implement deterministic local risk classification for destructive deletion, broad git staging, privilege elevation, remote/network effects, redirection, encoded PowerShell, Invoke-Expression, pipelines, compound commands, and suspicious obfuscation. Model risk labels are never authoritative.
- Store normalized plans only in main and digest session UID, attempt, shell, cwd, original input, option, exact payload, and edit revision.
- Renderer receives display text and opaque IDs. Main resolves approval from stored data, rejects stale/mismatched/replayed IDs, and requires fresh approval after every edit. High-risk payloads require a second deliberate confirmation.
- Add strict maximums and redacted typed error codes.

## Acceptance

- Malformed/adversarial/oversized model output cannot reach Session.write.
- Reject/cancel writes nothing.
- Editing changes the digest and invalidates old approval.
- Session/cwd/shell/new-attempt changes invalidate the plan.
- Main, not renderer, supplies exact bytes for execution.
- Companion tests cover all UDC-2 approval and privacy decisions.
