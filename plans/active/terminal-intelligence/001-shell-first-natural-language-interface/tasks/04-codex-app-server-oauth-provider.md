
# Task 04: Add the hardened Codex OAuth provider

## In plain English

Use Codex's official browser sign-in and app-server protocol to generate proposals, while preventing Codex from running commands or accessing the user's project.

## Work

- Implement CodexAppServerProvider in Electron main using child_process.spawn with shell:false, windowsHide:true, piped stdio, bounded JSONL parsing, timeouts/cancellation, and lifecycle cleanup.
- Use a Hyper-specific CODEX_HOME under an app.getPath('userData') subdirectory. Write only non-secret hardened config: keyring credential storage, shell tool/apps/hooks/multi-agent/remote plugins/memories/web search disabled, no MCP servers, no project instructions, and an empty app-controlled cwd.
- Implement initialize, account/read, account/login/start with ChatGPT browser OAuth, login cancel/completion, account/logout, ephemeral thread/start, turn/start with strict outputSchema, turn interrupt, and streamed completion/error handling.
- Validate external login URLs as HTTPS before opening them. Never implement OAuth token exchange or read/copy auth.json.
- Reject and abort on every server request for command execution, file changes, permissions, MCP, tools, or additional user input.
- Capability-check the configured Codex executable/protocol and give actionable missing/incompatible/offline/rate-limit/401/crash messages.
- Ensure provider env changes are local to the child and never leak CODEX_HOME or credentials into spawned terminal sessions.

## Tests and verification

- Fake child tests cover fragmented/malformed/oversized JSONL, request correlation, login success/cancel, signed-out, timeout, abort, 401, rate limit, crash/restart, incompatible methods, unexpected tool requests, stderr redaction, and dispose.
- Assert tokens never cross IPC, Redux, logs, electron-store, snapshots, or PTY env.
- Windows smoke asserts no console window option and child cleanup.
- pnpm lint and pnpm test:unit pass.
