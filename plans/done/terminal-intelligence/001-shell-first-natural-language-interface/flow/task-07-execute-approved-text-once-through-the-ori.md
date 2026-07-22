# Task 07: Execute approved text once through the original PTY

The renderer sends only opaque approval identifiers. The main process binds them to the actual Electron sender, re-samples terminal context, atomically consumes the immutable command, and synchronously writes the stored bytes plus PowerShell Enter once to the original Session. Closed sessions do not write; synchronous PTY errors have an unknown outcome and never retry. A later generated command-not-found event is displayed normally and consumed as an explicit-retry state instead of recursively invoking Codex.

```mermaid
sequenceDiagram
  participant R as Renderer NLI panel
  participant W as Electron main window
  participant S as NliService + immutable plan
  participant P as Original Session/node-pty
  R->>W: approve(session, attempt, plan, option, revision)
  W->>W: validate actual webContents + window
  W->>S: approve(request, main-derived identity)
  S->>S: re-sample shell/cwd and atomically consume
  S-->>W: authoritative shellText
  W->>P: Session.write(shellText + Enter) exactly once
  W->>S: completeApproval or failApproval
  W-->>R: sent/error state + restore terminal focus
  P-->>W: unchanged PTY echo/output
  alt generated command not found
    W->>S: authenticated command-not-found event
    S-->>R: explicit retry state, no recursive provider call
  end
```
