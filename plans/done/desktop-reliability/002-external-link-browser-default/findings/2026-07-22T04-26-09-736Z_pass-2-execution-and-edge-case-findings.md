# Pass 2 execution and edge-case findings
**Lens**: lightweight-pass-2
**Timestamp**: 2026-07-22T04:26:09.736Z
## Findings

- **High — Goal alignment:** System mode previously denied an intermediate `about:blank` request, so scripts that open a blank window and then assign an HTTP(S) URL would fail to open the OS browser. Added a hardened, invisible, timed bridge that captures the first safe navigation, launches externally, and destroys itself.
- **High — Architectural coherence:** The typed renderer RPC has no Electron handler return value, while generic `window.open` does. Clarified that internal RPC requests create/load a managed BrowserWindow directly, whereas generic requests use `setWindowOpenHandler` plus `did-create-window`; both share policy, secure options, and recovery helpers.
- **Medium — Verification adequacy:** The packaged test could accidentally launch a real OS browser in CI. Restricted system/bridge verification to mocked unit tests and made packaged E2E internal-only with a temporary `XDG_CONFIG_HOME` fixture.
- **Medium — Lifecycle completeness:** Added hidden-bridge navigation, unsupported redirect, timeout, visibility, and leak invariants.
- **Low — Wording:** Narrowed the centralization claim to core terminal/notification links plus all `window.open` requests, preserving intentional system-only menu/API behavior.

## Code-reading attestation

- refs/goal-context.md:1-17
- plan.md:1-115
- tasks/001-implement.md:1-58
- app/ui/window.ts:1-368
- app/index.ts:1-248
- app/config/init.ts:1-63
- app/config/paths.ts:1-96
- lib/components/term.tsx:1-235
- lib/components/notifications.tsx:1-132
- typings/common.d.ts:1-60
- test/index.ts:1-55
- package.json:1-147

The requested Cue persona slug was unavailable and the local persona catalog contained zero entries, so this pass used the tool-specified architectural-coherence lens directly.