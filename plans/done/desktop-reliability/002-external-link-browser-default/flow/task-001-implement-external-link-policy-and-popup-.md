# Task 001: Implement external-link policy and popup recovery

The renderer sends governed web links to one main-process controller. The controller reads live profile config, launches HTTP(S) in the OS browser by default, or creates a hardened managed child for explicit internal mode; closing that child restores the same owner without reload or PTY recreation.

```mermaid
flowchart LR
  T[Terminal and notifications] --> R[typed open link RPC]
  W[window.open] --> P[LinkOpeningController]
  R --> P
  C[live profile config] --> P
  P -->|system HTTP(S)| S[OS browser]
  P -->|system about:blank| B[hidden timed bridge]
  B --> S
  P -->|internal| I[hardened child]
  I -->|nested popup| P
  I -->|closed| O[restore same owner]
  O --> X[same URL renderer PID and PTYs]
  P -->|unsupported| D[deny]
```
