
# Task 03: Wire the per-session shell-first lifecycle

## In plain English

Turn one authoritative shell event into one cancelable proposal request without blocking the terminal or mixing tabs.

## Work

- Add a main-only NliService/controller keyed by session UID and attempt ID.
- Wire Session semantic events through app/ui/window.ts after ordinary error output has been emitted to the renderer.
- Snapshot allowlisted context: failed line, shell family/version, OS, opaque session ID, and cwd disclosure value. Do not collect scrollback/history/env/files/clipboard.
- Lazy-create the provider only on a verified command-not-found event after privacy consent/auth gates.
- Dedupe repeated hooks, cancel on newer attempts/session close/window close, and invalidate stale work on cwd/shell changes.
- Tag approved NLI-originated writes so their failure cannot recursively trigger automatic interpretation.
- Emit display-safe state/errors through typed RPC and add deterministic fake-provider controller tests.

## Acceptance

- Valid input and ordinary nonzero exits instantiate no provider and add no awaited work before Session.write.
- One failure creates at most one request in its own pane.
- The shell remains responsive during auth/provider work.
- Closing or superseding a session aborts the request and cannot update another pane.
- pnpm lint and focused unit tests pass.
