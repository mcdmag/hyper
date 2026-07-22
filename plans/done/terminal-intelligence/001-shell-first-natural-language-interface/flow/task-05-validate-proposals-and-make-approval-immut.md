# Task 05: Validate proposals and make approval immutable

Provider output is strictly validated, then a main-only immutable vault binds exact command bytes to the terminal context. The renderer gets display-safe previews and opaque IDs. Main atomically rejects stale/replayed requests and owns the high-risk two-step challenge.

```mermaid
flowchart LR
  P[Codex output] --> V[Strict validator]
  V -->|invalid| E[Safe error]
  V -->|plan| S[NliService]
  S --> M[Main-only immutable vault]
  M --> D[Preview and opaque IDs]
  D --> A[Approval]
  A --> X{Context and revision current?}
  X -->|no| R[Reject or stale]
  X -->|yes low or medium| W[Authorize stored bytes once]
  X -->|yes high first step| H[Main-owned challenge]
  H -->|matching second step| W
  W --> Q[Task 07 PTY write]
```
