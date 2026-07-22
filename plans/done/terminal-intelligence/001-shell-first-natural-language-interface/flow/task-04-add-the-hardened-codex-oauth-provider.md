# Task 04: Add the hardened Codex OAuth provider

Hyper lazily creates a main-only Codex app-server provider after an authoritative shell failure. Startup prepares private storage and proves keyring/read-only/no-web/tool-disabled configuration. OAuth uses an HTTPS system-browser URL; interpretation uses ephemeral output-schema turns. Unexpected server requests are denied before the child and active turn fail closed.

```mermaid
flowchart LR
  PTY[PowerShell PTY] -->|command-not-found| Service[NliService]
  Service -->|lazy request| Provider[CodexAppServerProvider]
  Provider --> Private[Private CODEX_HOME + empty cwd]
  Provider -->|hidden JSONL stdio| Codex[Codex app-server]
  Codex -->|config and features| Provider
  Provider -->|HTTPS OAuth| Browser[System browser]
  Codex -->|structured completion| Provider
  Provider -->|proposal only| Service
  Codex -->|server request| Deny[Deny then abort]
  Service -->|display-safe state| UI[Renderer]
```
