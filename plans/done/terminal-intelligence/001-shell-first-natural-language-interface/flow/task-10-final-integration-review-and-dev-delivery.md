# Task 10: Final integration, review, and dev delivery

Task 10 closes the final delivery gap by coordinating per-install revocation across every live Hyper window, then validating the complete shell-first NLI feature before GitHub delivery.

```mermaid
flowchart LR
  W1[Hyper window service] --> C[NLI window coordinator]
  W2[Hyper window service] --> C
  C --> R[Reset privacy or logout fanout]
  R --> S[All renderer sessions receive auth state]
  F[Feature branch] --> T[114 tests + build + Windows package]
  T --> E[8 Electron journeys + isolated packaged smoke]
  E --> P[10 Cue proof obligations verified]
  P --> D[PR to dev]
```
