---
spec_id: 3
status: active
created: 2026-07-24
completed: null
category: terminal-intelligence
subsystems: []
---
# Vision

## Outcome

Hyper NLI remains usable when Codex changes version numbers or adds non-authoritative app-server response fields, provided actual protocol methods and required isolation capabilities remain compatible. Codex 0.145 reaches the existing OAuth flow while unsafe or unprovable configurations fail closed.

## Existing system flow

Renderer NLI actions call Electron-main RPC handlers, which delegate to `NliService`. The service lazily constructs the sole production `CodexAppServerProvider` and calls stable `NliProvider` methods. Startup creates a private keyring-backed home and empty cwd, writes strict config, sanitizes the environment, starts hidden app-server, negotiates readiness, and only then allows account or turn requests. Safe errors return to the renderer; child processes and temporary directories are disposed with the service.

## Proposed flow

After valid initialize, read effective config. Prove keyring storage and fixed safety settings from explicit paths, then prove dangerous features disabled from the effective map. Only if that map is unavailable request the legacy feature list. Ignore extra metadata and version branding; stop before auth or interpretation when any required capability is missing or unsafe.

## Why this is simplest

The current startup gate and scripted harness already own this responsibility. A version bump repeats brittleness; ignoring only `origins` leaves recursive collisions elsewhere. Explicit semantic paths plus one legacy fallback handle both known representations without a new component.

## Scope and impact

This source-controlled Electron-main behavior benefits every Hyper user on a compatible Codex update. It does not belong in user/session/workspace settings. Renderer, IPC, preferences, shell hooks, plan validation, and visible interaction stay unchanged.

## Integration surface

`app/ui/window.ts` has the only production constructor. Its status/login RPC handlers call `NliService`, and `app/nli/window-coordinator.ts` delegates cross-window auth actions to the same service. `NliService` consumes the provider through `NliProvider`; no divergent compatibility path exists. Direct surfaces are provider startup, service auth calls, provider unit fixtures, the retained legacy fixture, and NLI documentation. Renderer, config schema, and session integration are consumers of the stable service/types only and require no code change.

## Module Boundaries

### Public API

The application-facing contract remains `NliProvider` in `typings/nli.d.ts`: auth status, login cancellation, logout, interpretation, and disposal. `CodexAppServerProvider` implements it and is instantiated only by Electron main; `NliService` has no Codex protocol knowledge.

Existing exports remain: `CODEX_APP_SERVER_CONFIG`, `NliCodexFileSystem`, `CodexAppServerProviderOptions`, `NliProviderError`, `createCodexChildEnvironment`, and `CodexAppServerProvider`. No renderer IPC, service method, configuration key, or public provider abstraction is added.

### Internals

Version branding, JSON-RPC handshake details, effective-config inspection, feature fallback, request correlation, notifications, and child lifecycle remain private provider internals. Tests use the scripted child and filesystem seams, not an exported compatibility helper.

### Invariants

- `NliService` depends only on `NliProvider`.
- Version text alone never accepts or rejects compatibility.
- Acceptance requires keyring, approval `never`, read-only sandbox, disabled web, and every dangerous feature proven false.
- Layers/origins/provenance cannot override or masquerade as effective state.
- Missing, malformed, contradictory, unsafe, or unprovable state fails closed as `NLI_CODEX_INCOMPATIBLE`.
- Private home, empty cwd, environment allowlist, hidden non-shell spawn, bounded JSONL, and server-request denial remain intact.
- Credentials, stderr, protocol payloads, and metadata never enter renderer state, PTY output, diagnostics, or logs.
- Existing error mapping and auth/interpretation semantics remain unchanged.

## Operational characteristics

Startup remains lazy and single-flight per `NliService`. Modern Codex responses avoid the extra experimental feature-list request when effective feature state is complete; legacy responses add at most the existing one bounded request. No collection scales with terminal history, project size, or account data.

## Delivery and rollback

The implementation branch is verified first, merged by PR into `dev`, and local/remote `dev` are fast-forwarded before the final package is built and relaunched. Rollback is a revert of that merge commit followed by the same package smoke and redeploy; no user config, credential, or storage migration is introduced.

## Success signals

- Installed Codex 0.145 returns signed-out or signed-in rather than incompatible.
- Extra provenance fields and arbitrary version branding do not alter acceptance.
- The 0.144.6 representation still negotiates through legacy fallback.
- Unsafe, missing, malformed, or contradictory security state is rejected.
- Tests, build, packaged smoke, PR merge, dev fast-forward, and relaunch complete.
