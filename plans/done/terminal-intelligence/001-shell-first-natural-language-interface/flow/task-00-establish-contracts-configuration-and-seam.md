# Task 00: Establish contracts, configuration, and seams

Task 00 establishes compile-time and storage boundaries while leaving the live terminal path untouched. Renderer approvals carry only opaque identifiers; main-owned provider plans retain authoritative command bytes; privacy state is stored separately under userData and runtime factories remain injectable for later tasks.

```mermaid
flowchart LR
  X[xterm input] --> R[renderer sendSessionData]
  R --> W[main RPC data handler]
  W --> S[Session.write]
  S --> P[node-pty]
  C[Default config: NLI disabled] -. no runtime import .-> W
  O[Opaque approval IDs] --> W
  M[Main-only plan bytes] -. not in approval IPC .-> W
  U[userData preferences] --> F[Injectable store]
  D[Injected clock/nonce/child/provider] --> N[Future NliService]
```
