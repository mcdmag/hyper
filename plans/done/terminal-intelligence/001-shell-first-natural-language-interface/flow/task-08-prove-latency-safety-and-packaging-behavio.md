# Task 08: Prove latency, safety, and packaging behavior

Task 08 adds a deterministic test-only provider and exercises the complete shell-first path in the real Electron/PTY application, then packages the Windows app and proves profile/process isolation and responsive visual states.

```mermaid
flowchart LR
  U[User input] --> P[Original PTY write]
  P -->|valid or ordinary nonzero| T[Terminal output only]
  P -->|authenticated command-not-found| S[NLI service]
  S --> F[Test-only JSONL provider]
  F --> R[Bounded review and approval]
  R -->|approved once| P
  E[Electron E2E] --> U
  E --> V[Visual proof]
  B[Packaged Hyper.exe] --> I[Isolated user-data and fixture]
  I --> W[One GUI window]
  I --> C[No dangling processes]
  I --> D[Real profiles untouched]
```
