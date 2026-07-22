# Task 01: Build responsive interaction mockups

The standalone reference selects a named state from the URL, clones its semantic template into a non-modal panel over a still-visible terminal, and exposes deterministic desktop/narrow fixtures. The capture script renders both sizes, records screenshots, then verifies Escape dismisses the panel and restores terminal focus.

```mermaid
flowchart LR
  Q[URL state + fixture] --> T[Named HTML template]
  T --> P[Hyper-style NLI panel]
  O[Visible shell output] --> P
  P --> A[Native controls + live regions]
  K[Escape] --> C[Dismiss panel]
  C --> F[Restore terminal focus]
  S[Playwright capture script] --> Q
  S --> D[900x720 desktop PNG]
  S --> N[320x720 narrow PNG]
  S --> K
```
