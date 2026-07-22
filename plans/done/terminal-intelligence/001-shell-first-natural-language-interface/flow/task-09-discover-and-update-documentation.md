# Task 09: Discover and update documentation

Task 09 documents the implemented shell-first lifecycle from user setup through privacy, OAuth, approval, rollback, and maintainer verification, with README as the discovery entry point and a single authoritative guide.

```mermaid
flowchart LR
  R[README entry] --> G[NLI user and maintainer guide]
  G --> S[Setup and support matrix]
  G --> P[Privacy and Codex OAuth isolation]
  G --> A[Review and exact-once approval]
  G --> T[Troubleshooting and rollback]
  G --> M[Protocol and fixture maintenance]
  M --> V[Unit, Electron, package smoke gates]
  V --> D[PR explicitly targets dev]
```
