
# Task 04: Add the hardened Codex OAuth provider

## In plain English

Use Codex's official browser sign-in and app-server protocol to generate proposals, while preventing Codex from running commands or accessing the user's project.

## Work

- [ ] Implement CodexAppServerProvider in Electron main using child_process.spawn with shell:false, windowsHide:true, piped stdio, bounded JSONL parsing, requestTimeoutMs cancellation, and lifecycle cleanup.
- [ ] Use a Hyper-specific CODEX_HOME under an app.getPath('userData') subdirectory, an empty app-controlled cwd, and a newly constructed child env allowlisting only PATH/PATHEXT, SystemRoot/WINDIR, HOME/USERPROFILE, APPDATA/LOCALAPPDATA, TEMP/TMP, LANG/LC_*, XDG_RUNTIME_DIR/DBUS_SESSION_BUS_ADDRESS where present, and the private CODEX_HOME; never spread process.env.
- [ ] Commit the codex-cli 0.144.6 generated v2 protocol subset fixture and require version >=0.144.6 plus initialize, account/read, account/login/start, account/logout, thread/start, turn/start, turn/interrupt, and outputSchema compatibility.
- [ ] Write the exact hardened config from plan.md, start in the empty cwd, read back effective config/capabilities, and fail with NLI_CODEX_INCOMPATIBLE if keyring-only/tool-free/read-only/no-web isolation cannot be proven.
- [ ] Implement initialize, account/read, account/login/start with ChatGPT browser OAuth, login cancel/completion, account/logout, ephemeral thread/start, turn/start with strict outputSchema, turn interrupt, and streamed completion/error handling.
- [ ] Validate login URLs as HTTPS before opening; never implement token exchange or read/copy auth.json.
- [ ] Reject and abort every server request for command/file/permission/MCP/tool/additional-input action before dispatch; capability-prove tool isolation at startup and fail closed if unavailable.
- [ ] Capability-check executable/protocol and return safe typed missing/incompatible/keyring-unavailable/userData-unwritable/offline/rate-limit/401/crash errors without logging stdout/stderr content.
- [ ] Keep provider env local to the child and prove CODEX_HOME/credentials never reach terminal sessions.
- [ ] Add test/unit/nli-codex-app-server.test.ts with a scripted fake child and threat-model fixtures.

## Tests and verification

- [ ] Fake-child fixtures cover fragmented/malformed/oversized JSONL, request correlation, login success/cancel, signed-out, timeout, abort, 401, rate limit, crash/restart, incompatible methods/config, pre-dispatch denial of every tool/file request, stderr redaction, and dispose.
- [ ] Environment fixtures prove API-key/token/secret/MCP/plugin/project variables and terminal profile env are absent while platform-required allowlisted variables remain.
- [ ] Tests assert tokens never cross IPC, Redux, logs, electron-store, snapshots, or PTY env.
- [ ] Windows spawn fixture asserts shell:false, windowsHide:true, and child cleanup.

## Verify

- [ ] Run: pnpm exec ava test/unit/nli-codex-app-server.test.ts
- [ ] Run: pnpm lint
