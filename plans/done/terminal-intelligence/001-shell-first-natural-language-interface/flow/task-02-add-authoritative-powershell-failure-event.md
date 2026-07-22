# Task 02: Add authoritative PowerShell failure events

User input stays on Hyper's original synchronous write path. Only a nonce-authenticated unresolved PowerShell lookup becomes a semantic event, and only after ordinary error bytes are flushed.

```mermaid
flowchart LR
  U[User input] --> W[Session.write]
  W --> P[PowerShell PTY]
  P -->|ordinary output| O[OSC parser before DataBatcher]
  P -->|unresolved lookup| H[CommandNotFoundAction hook]
  H -->|nonce-bound private OSC| O
  O -->|visible shell error| B[DataBatcher synchronous flush]
  B --> R[Renderer terminal]
  B --> G[Semantic event gate]
  G -->|after visible output| E[NLI shell semantic event]
  O -->|invalid or wrong nonce| B
```
