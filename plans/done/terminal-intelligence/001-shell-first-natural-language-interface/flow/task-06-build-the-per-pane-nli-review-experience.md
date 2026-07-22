# Task 06: Build the per-pane NLI review experience

Task 06 adds a per-session renderer recovery surface without entering the valid-command hot path. Main remains authoritative for privacy, authentication, plan validation, risk, command bytes, and window identity; renderer state receives display-safe data only and returns opaque choices. Each terminal and its panel share a docked grid so xterm remains visible and resizes naturally.

```mermaid
flowchart TD
  U[User input] --> PTY[Existing Session.write to original PTY]
  PTY -->|authoritative PowerShell CommandNotFoundAction only| S[NliService in Electron main]
  MENU[Tools → Natural Language Setup] --> SETUP[Always-available setup state]
  S --> G{Privacy + Codex auth gates}
  G -->|consented and signed in| C[Hardened Codex provider]
  C --> V[Validate bounded plan and classify local risk]
  V --> VAULT[Main-owned immutable command-plan vault]
  V --> RPC[Display-safe NLI state RPC]
  SETUP --> R[Session-UID-keyed Redux slice]
  RPC --> R
  R --> P[NliPanel in originating TermGroup]
  P -->|native choice/edit/approve controls| O[Opaque plan and option IDs]
  O --> VAULT
  VAULT -->|Task 07 after fresh context checks| PTY
  P -->|Escape| F[Restore originating xterm focus]
```
