---
spec_id: 2
slug: external-link-browser-default
mode: lightweight
epic: desktop-reliability
created: 2026-07-22
promoted_to: null
---

## Problem

Opening a link through Hyper's internal Electron browser popup can leave the owning Hyper window blank and unrecoverable after the popup closes, forcing the user to quit Hyper. Hyper needs one configurable link-opening policy that defaults to the operating system browser for existing and new profiles, retains a safe internal-popup opt-in, and preserves the same visible terminal and live PTY sessions when that popup closes.

## Root Cause

Hyper has several uncoordinated link paths and no owner/child recovery contract:

- Terminal hyperlinks call `shell.openExternal` directly in `lib/components/term.tsx:209-221`, bypassing any configurable main-process policy and discarding the launch promise.
- Notification links repeat direct renderer-side `shell.openExternal` calls in `lib/components/notifications.tsx:45-57`, `75-83`, and `98-112`.
- Generic renderer and plugin `window.open` requests reach `app/ui/window.ts:319-326`. The handler reuses the drag/drop parser, returns `deny` only for file/HTTP(S) inputs, and returns `allow` for every other URL or intermediate `about:blank` request.
- Electron-created popup windows do not pass through the tracked `createWindow` path in `app/index.ts:96-157`; consequently, they are absent from `windowSet`, Hyper cleanup, and any owner-focus recovery. `app/ui/window.ts` also has no `did-create-window` listener.
- Reloading the owner is unsafe recovery because `app/ui/window.ts:291-298` deletes all PTY sessions after a subsequent main-window navigation.

The failing regression must capture both direct URLs and `about:blank`-then-navigate requests, but the implementation boundary is deterministic: core terminal/notification links and all `window.open` requests must enter one main-process policy, and every Electron child must be hidden-and-short-lived or have a close-to-owner lifecycle.

## Change

1. Add `config.webLinksOpenMode` with values `'system'` and `'internal'`; set `'system'` in `app/config/config-default.json`. `app/config/init.ts:33-54` already merges missing user keys from shipped defaults, so existing config files receive the new default without being rewritten, while root/profile overrides continue to work and live config reloads affect the next link.
2. Add `app/utils/link-opening.ts` as the single policy/controller. It must parse URLs without throwing, allow HTTP(S) for this web-link feature, and decide among deny, system launch, visible internal child, and a hidden system bridge for `about:blank`-then-navigate flows. Malformed URLs and unsupported schemes are denied.
3. Add a typed renderer-to-main `open link` event in `typings/common.d.ts`. Route terminal links and notification links through it. The main handler launches the system browser in system mode or creates and loads a managed internal BrowserWindow in internal mode. Keep the existing `open external` event and Help/menu calls system-only for plugin/API compatibility.
4. In system mode, a direct HTTP(S) request calls `shell.openExternal(url)` and returns `deny` from `setWindowOpenHandler`, so Electron creates no visible popup. For `window.open('about:blank')` followed by script navigation, allow a hardened `show: false` bridge child, intercept its first navigation: safe HTTP(S) is launched externally and the bridge is destroyed; unsupported navigation is denied and the bridge is destroyed. A `SYSTEM_LINK_BRIDGE_TIMEOUT_MS = 5000` timeout destroys a bridge that never navigates. No bridge may become visible or outlive the owner.
5. On external-launch rejection, emit an error-level diagnostic through `console.error` without logging the URL, and show a non-blocking Hyper notification explaining that the OS browser could not be opened; never navigate or reload the owner.
6. In internal mode, direct RPC requests create and load one managed child; generic `window.open` requests return `allow`. Both paths use `outlivesOpener: false` and hardened BrowserWindow options: parent set to the owner, `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. Register `did-create-window` before requests are handled, apply the same URL policy to child navigation and nested popup attempts, and attach an idempotent child-close handler that restores a minimized owner, shows it, focuses both BrowserWindow and webContents, and performs no reload or session cleanup.
7. Keep drag/drop behavior confined to the owner `will-navigate` path; do not send ordinary `window.open` URLs to the active shell as pasted session data.
8. Regenerate `app/config/schema.json`. Add unit coverage for URL/policy decisions, config merging, both internal creation paths, hidden bridge timeout/navigation, secure popup options, launch failure, nested requests, and idempotent owner recovery. Extend the packaged Electron test to prove internal popup close preserves owner URL, renderer process, session IDs, visibility, focus, and a non-empty captured frame.

### State Contracts

| Boundary | Input | Transformation | Output/invariant |
| --- | --- | --- | --- |
| Renderer link -> typed RPC | `{url: string}` from terminal or notification activation | No renderer-side open; main process reads the owning window's current decorated profile config | Exactly one `open link` request; system launches externally, internal creates/loads a managed child; raw URL is not logged |
| Config -> policy | `webLinksOpenMode` from live `cfg` | Missing/invalid values resolve to shipped `'system'` default; explicit profile `'internal'` is retained | Decision uses config effective at click time |
| `window.open` -> policy | `{url, disposition, frameName}` plus owner | Parse and allowlist HTTP(S); map system `about:blank` to a hidden timed bridge and internal `about:blank` to a guarded visible child | Direct system returns `deny` after one launch; bridge returns hardened hidden `allow`; internal returns hardened visible `allow`; invalid returns `deny` |
| Managed child -> owner recovery | Internal child `closed` event or hidden bridge completion/timeout | Internal: idempotent restore/show/focus guarded by `isDestroyed()`; bridge: destroy without focus theft | Owner URL, renderer process, and session IDs unchanged; no cleanup/reload; zero bridge leaks |
| External launch failure -> user | Rejected `shell.openExternal` promise | Error-level local diagnostic with URL redacted plus Hyper notification | Hyper remains interactive and no popup is created |

## Public API

`config.webLinksOpenMode: 'system' | 'internal'` (default: `'system'`)

## Decisions

- Apply the system-browser default to every existing and new profile that omits the key; the existing default merge is the migration and no user config file is rewritten.
- Apply the preference to user-clicked terminal links, renderer notification links, and generic renderer/plugin `window.open` HTTP(S) requests. Explicit `open external` RPC callers and Help/menu actions remain system-only to preserve their documented intent.
- Keep internal browsing as an explicit opt-in and harden remote children instead of inheriting Hyper's privileged main-renderer preferences.
- Recover the existing owner in place. A reload, replacement Hyper window, or PTY recreation is forbidden.
- Error strategy: launch failures use a redacted `console.error` diagnostic at error severity plus the existing non-blocking `notify` surface. Invalid/unsupported schemes are denied and covered by tests; no URL is logged.
- No telemetry is added. Hyper has no telemetry pipeline in this codebase, and link destinations may contain sensitive data; local diagnostics and user-visible notification are sufficient for this recoverable desktop failure.
- Rollback is to run `git revert` on the final implementation merge commit recorded in the feature summary. There is no data migration to reverse: older builds ignore the new JSON key, and reverting restores the prior handler and direct link paths without rewriting user config.
- No adaptive task is required: the affected boundaries, policy values, error behavior, and recovery invariant are knowable from current source. The initial failing cases validate the mechanism; they do not choose the design.

## Alternatives Considered

- Remove internal browsing: rejected because the requested behavior retains it as an option.
- Change only `WebLinksAddon`: rejected because it would miss notification and plugin `window.open` entry points and would not repair popup-close recovery.
- Keep returning `allow` and merely refocus later: rejected because it preserves an untracked, privileged child-window path.
- Reload Hyper after popup close: rejected because `did-navigate` cleanup can destroy live PTY sessions.
- Restore the legacy in-terminal `<webview>`: rejected because current Hyper removed that implementation and the Electron child-window boundary already covers the requested popup behavior.

## Files Touched

Expected implementation surface:

- `app/ui/window.ts:247-249,291-326` — consume the configurable link RPC, separate dropped navigation, install policy and managed child recovery.
- `app/utils/link-opening.ts` (new) — URL decisions, external launch, direct internal creation, hidden bridge management, secure options, and owner-recovery helpers.
- `lib/components/term.tsx:1,209-221` — replace direct renderer `shell.openExternal` with typed configurable link RPC.
- `lib/components/notifications.tsx:45-57,75-83,98-112` — route user-clicked renderer links through the same policy.
- `typings/common.d.ts:32-48` — add the typed `open link` request while retaining `open external`.
- `app/config/config-default.json:54-65` — set the system-browser default.
- `typings/config.d.ts:183-196` — declare and document the public option.
- `app/config/schema.json` — regenerate the checked-in schema.
- `test/unit/link-opening.test.ts` (new) — policy, config-merge, failure, security, and lifecycle matrix.
- `test/index.ts:12-55` — packaged Electron regression for internal child close and owner continuity.

### Integration Surface / Blast Radius

- `WebLinksAddon` is the terminal hyperlink entry point and must emit the new typed RPC.
- Notification message, release-note, and download anchors are the core renderer link entry points and must emit the same RPC.
- Renderer/plugin `window.open` is intercepted globally by the owning Hyper window's `setWindowOpenHandler`.
- `app/index.ts::createWindow` remains the lifecycle owner for Hyper terminal windows and must not receive popup children.
- `app/config/init.ts::_init` supplies the default to existing configs; the generated schema exposes the option to JSON-aware editors.
- Existing `open external` RPC and Help/menu `shell.openExternal` calls remain intentionally system-only and require regression assertions, not semantic changes.

### Out of scope

- Choosing a named non-default browser executable.
- Supporting arbitrary protocols or file URLs as web links.
- Reintroducing an in-terminal webview, browser toolbar, history, downloads, or persistent cookies.
- Changing Hyper window/tab close behavior, PTY lifecycle, or unrelated navigation handling.
- Adding settings UI, telemetry, or URL-bearing logs.

No visual mockup is required because the feature adds a JSON configuration contract and lifecycle behavior, not a new screen or interaction layout.

## Verification

1. Run `pnpm exec ava test/unit/link-opening.test.ts`. The suite must prove the system/internal/bridge/deny matrix, missing versus explicit config values, redacted failure reporting, direct-RPC internal creation, secure BrowserWindow overrides, bridge navigation/timeout cleanup, nested-popup handling, and idempotent owner recovery.
2. Run `pnpm run generate-schema`, commit the generated schema, then run `pnpm run generate-schema && git diff --exit-code -- app/config/schema.json` to prove generation is stable.
3. Run `rg -n 'webLinksOpenMode|open link' app lib typings test` and confirm every integration surface listed above is present and no terminal/notification link path still calls renderer-side `shell.openExternal`.
4. Run `pnpm run lint`, `pnpm exec tsc -b --pretty false`, and `pnpm run test:unit`.
5. Run `pnpm run dist && pnpm run test:e2e`. In test setup, create a temporary `XDG_CONFIG_HOME/Hyper/hyper.json` from the shipped default with `webLinksOpenMode: 'internal'`, start a loopback Node HTTP fixture, and launch Hyper with that environment. The regression must open/close the fixture child and assert one hardened child plus the same owner URL/renderer/session IDs after close, focused/visible owner state, and a non-empty captured frame. System/bridge behavior remains fully mocked in the unit suite so CI never launches a real OS browser.
6. Repeat the internal open/close action in the packaged regression and assert BrowserWindow count returns to baseline after every cycle, proving no blank owner or leaked popup; clean up the temporary config directory in the test teardown.

## Commit Ref

Plan commit: `74e11732`. Implementation commits must include `Spec-ref: 002-external-link-browser-default`; delivery evidence records the final merge commit in the generated summary.
