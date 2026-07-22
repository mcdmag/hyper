# Multi-perspective design synthesis

## Runtime perspective

Keep raw user input unchanged. Add a safe interactive PowerShell adapter, nonce-tagged private OSC semantic event, and bounded streaming parser at Session output. Do not trigger from generic exit status or error strings. Preserve prior PowerShell lookup handlers and profiles. Dedupe by session/attempt and suppress recursive generated-command fallback.

## Auth/security perspective

Use a main-only NliProvider abstraction and Codex app-server over hidden stdio. Use a Hyper-specific CODEX_HOME under Electron userData with keyring-only auth and a tool-free configuration. Use account/login/start for official ChatGPT browser sign-in. Never read auth.json or receive tokens. Use an empty cwd, strict outputSchema, deny every tool/approval request, retain authoritative plans in main, and execute only opaque approved IDs after context revalidation.

The existing Hyper renderer/plugin surface is privileged, so this feature's approval is a model-safety boundary, not a claim that a compromised renderer cannot execute commands. New RPC must still validate sender/session and must not increase credential exposure.

## UX/testing perspective

Use a per-session non-modal panel with privacy, auth, interpreting, one/multiple options, editing, high-risk, stale, retry, and unsupported-shell states. Use native controls, safe focus, Escape restore, aria-live, non-color risk text, reduced motion, and narrow-pane layout. Opening the panel never makes Enter execute. Test valid commands, valid failures, shell marker chunking/spoofing, auth/provider failure, malformed plans, stale approvals, atomic approval consumption plus one non-retried write attempt, two panes, keyboard/screen-reader behavior, and packaged hidden child behavior.
