# Research synthesis

## Official Codex integration

Official Codex documentation identifies app-server as the rich-client integration surface. It uses JSONL/JSON-RPC-like stdio, supports initialize, account flows, thread/start, turn/start, streamed events, cancellation, approvals, and structured output. The installed codex-cli 0.144.6 schemas were generated locally and confirm turn/start.outputSchema, approvalPolicy, sandboxPolicy, account/login/start, account/read, account/logout, and login completion notifications.

Codex supports ChatGPT browser sign-in and refreshes ChatGPT sessions. Credential storage can be forced to the OS keyring. auth.json contains access tokens and must not be read or copied. This design therefore delegates login and refresh to app-server, uses a Hyper-specific CODEX_HOME with keyring-only storage, and never exposes tokens to Hyper renderer state.

A proposal-only provider must disable shell_tool, apps, hooks, multi_agent, remote plugins, memories, web_search, MCP inheritance, skills/project instructions, and workspace access. It uses an empty app-controlled cwd and denies any server-initiated tool/approval request. Structured output is strictly bounded and locally validated.

Sources:
- https://learn.chatgpt.com/docs/auth.md
- https://learn.chatgpt.com/docs/app-server.md
- https://github.com/openai/codex/tree/main/codex-rs/app-server
- https://learn.chatgpt.com/docs/config-file
- https://learn.chatgpt.com/docs/non-interactive-mode

## Shell semantics and terminal protocol

Bash invokes command_not_found_handle with the original command/arguments only after path lookup fails; zsh has command_not_found_handler; fish has fish_command_not_found. Each still needs careful startup and prior-handler preservation before becoming a supported adapter. PowerShell exposes CommandNotFoundAction and a distinct CommandNotFoundException; local probes confirmed the action on Windows PowerShell 5.1 and PowerShell 7.

VS Code's documented OSC 633 shell integration demonstrates why exact shell-emitted command boundaries are more reliable than renderer keystroke reconstruction. xterm.js exposes parser hooks, but Hyper's main Session boundary is preferable here because provider/auth state remains main-only and a bounded parser can preserve all non-owned bytes.

cmd.exe exposes history/macros through doskey but no authoritative catch-all unresolved-command callback. Localized error text and errorlevel 9009 are not adequate for the promised trigger, so the automatic adapter fails closed.

Sources:
- https://www.gnu.org/software/bash/manual/html_node/Command-Search-and-Execution.html
- https://zsh.sourceforge.io/Doc/Release/Command-Execution.html
- https://fishshell.com/docs/current/cmds/fish_command_not_found.html
- https://learn.microsoft.com/dotnet/api/system.management.automation.commandinvocationintrinsics.commandnotfoundaction
- https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_error_handling
- https://code.visualstudio.com/docs/terminal/shell-integration
- https://xtermjs.org/docs/guides/hooks/
- https://learn.microsoft.com/windows-server/administration/windows-commands/doskey

## Electron/Node process behavior

Electron recommends app-specific files under a userData subdirectory. Node child_process.spawn supports piped stdio, AbortSignal cancellation, shell:false, and windowsHide:true; windowsHide is required because its default is false. The provider process is a normal child owned and cleaned up by Hyper, never a detached console or a PTY command.

Sources:
- https://www.electronjs.org/docs/latest/api/app
- https://nodejs.org/api/child_process.html
