
# Task 04: Add the hardened Codex OAuth provider

## In plain English

Use Codex's official browser sign-in and app-server protocol to generate proposals, while preventing Codex from running commands or accessing the user's project.

## Work

- [ ] Implement CodexAppServerProvider in Electron main using child_process.spawn with shell:false, windowsHide:true, piped stdio, bounded JSONL parsing, requestTimeoutMs cancellation, and lifecycle cleanup.
- [ ] Use a Hyper-specific CODEX_HOME under an app.getPath('userData') subdirectory and an empty app-controlled cwd.
- [ ] Generate hardened non-secret config using only capability-verified official keys: keyring credentials, shell tool/apps/hooks/multi-agent/remote plugins/memories/web search disabled, no MCP/project/skill inheritance; fail closed if the installed version cannot honor isolation.
- [ ] Implement initialize, account/read, account/login/start with ChatGPT browser OAuth, login cancel/completion, account/logout, ephemeral thread/start, turn/start with strict outputSchema, turn interrupt, and streamed completion/error handling.
- [ ] Validate login URLs as HTTPS before opening; never implement token exchange or read/copy auth.json.
- [ ] Reject and abort every server request for command/file/permission/MCP/tool/additional-input action.
- [ ] Capability-check executable/protocol and return safe typed missing/incompatible/offline/rate-limit/401/crash errors without logging stdout/stderr content.
- [ ] Keep provider env local to the child and prove CODEX_HOME/credentials never reach terminal sessions.
- [ ] Add test/unit/nli-codex-app-server.test.ts with a scripted fake child and threat-model fixtures.

## Tests and verification

- [ ] Fake-child fixtures cover fragmented/malformed/oversized JSONL, request correlation, login success/cancel, signed-out, timeout, abort, 401, rate limit, crash/restart, incompatible methods/config, unexpected tool requests, stderr redaction, and dispose.
- [ ] Tests assert tokens never cross IPC, Redux, logs, electron-store, snapshots, or PTY env.
- [ ] Windows spawn fixture asserts shell:false, windowsHide:true, and child cleanup.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-codex-app-server.test.ts
- [ ] Run: pnpm lint
