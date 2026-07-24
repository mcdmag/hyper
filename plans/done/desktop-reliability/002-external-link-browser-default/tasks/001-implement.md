# Task 001: Implement external-link policy and popup recovery

## In plain English

Make web links open in the operating system's default browser unless the user explicitly chooses Hyper's internal popup. When internal mode is selected, keep the popup isolated from Hyper's privileged terminal renderer and return the user to the same working terminal after the popup closes. A browser-launch failure must show a recoverable notification instead of blanking or navigating Hyper.

## Source anchors

- `app/ui/window.ts:247-249` currently discards external-open failures.
- `app/ui/window.ts:291-326` couples dropped navigation to `window.open` and allows unmanaged popups.
- `app/index.ts:96-157` tracks and cleans Hyper terminal windows but not Electron-created children.
- `lib/components/term.tsx:209-221` and `lib/components/notifications.tsx:45-112` open links directly in the renderer.
- `app/config/init.ts:33-54` merges shipped defaults into saved config.

## Implementation

- [x] Add a failing `test/unit/link-opening.test.ts` matrix for direct HTTP(S), system/internal `about:blank`, hidden bridge navigation/timeout, malformed/unsupported URLs, external-launch rejection, both internal creation paths, secure internal options, nested requests, repeated child close, and config default/profile merge.
- [x] Add `app/utils/link-opening.ts` with deterministic URL decisions, redacted external-launch errors, direct internal child creation/loading, hidden bridge management with `SYSTEM_LINK_BRIDGE_TIMEOUT_MS = 5000`, hardened BrowserWindow options, and idempotent owner recovery.
- [x] Add `webLinksOpenMode: 'system' | 'internal'` to the default config and public type; regenerate `app/config/schema.json`.
- [x] Add typed `open link` RPC plumbing and route terminal plus notification hyperlinks through it; preserve existing explicit `open external` and Help/menu behavior.
- [x] Refactor `app/ui/window.ts` so `will-navigate` alone owns dropped URL behavior, `setWindowOpenHandler` enforces the current profile policy, and `did-create-window` manages each internal child.
- [x] Extend `test/index.ts` to write a temporary `XDG_CONFIG_HOME/Hyper/hyper.json` set to internal mode, start a loopback Node HTTP fixture, and run the packaged Electron popup close-to-owner seam; keep all system-browser calls mocked in unit tests and clean both fixtures in teardown.
- [x] Run the full verification set, update plan evidence if implementation paths differ, and call `cue_plan_promote` before `cue_done` if Cue's lightweight scope guard reports more than two new files or 100 changed lines; promotion must not defer any requested behavior.

## State Contracts

| Boundary | Contract |
| --- | --- |
| Renderer -> main | `open link` carries only `{url: string}`; the renderer neither opens nor logs it. Main launches externally in system mode or creates/loads the managed child in internal mode. |
| Main config -> policy | Read the owning profile's live `webLinksOpenMode` at request time; omitted/invalid resolves to `system`. |
| Policy -> Electron | Direct system launches once and denies; system `about:blank` gets a hidden timed bridge; internal RPC creates/loads one hardened child; internal `window.open` allows one hardened child; invalid/unsupported denies. |
| Child -> owner | `closed` restores/shows/focuses a non-destroyed owner exactly once without reload, renderer replacement, or PTY/session mutation. |
| Failure -> user | External-launch rejection produces a URL-redacted error diagnostic and non-blocking Hyper notification; owner state is unchanged. |

## Acceptance Criteria

- [x] With the key omitted, root config omitted, or profile override omitted, effective mode is `system`; an explicit profile `internal` value survives merge and reload.
- [x] System mode opens each direct HTTP(S) request exactly once through mocked `shell.openExternal`, creates zero visible child windows, and catches rejection without changing owner URL, renderer process, or sessions.
- [x] A system-mode `about:blank` flow creates only a hardened hidden bridge; its first safe navigation launches externally and destroys it, unsupported navigation is denied, and timeout cleanup returns child count to baseline.
- [x] Internal RPC and `window.open` paths each create one child whose options set `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `outlivesOpener: false`.
- [x] Invoking recovery more than once in unit tests is idempotent; across repeated real popup cycles the same owner becomes visible/focused, its captured frame is non-empty, its URL/renderer/session IDs are unchanged, and BrowserWindow count returns to baseline.
- [x] Malformed URLs and unsupported protocols are denied without shell launch or visible child creation; internal and bridge children cannot later navigate to an unsupported protocol.
- [x] Nested popup attempts are subject to the same allowlist and lifecycle policy.
- [x] Existing `open external` RPC and Help/menu system-browser behavior remain unchanged.
- [x] External-launch diagnostics never contain the requested URL, and no telemetry event is introduced.
- [x] Generated schema exposes the two enum values and is stable on a second generation.

## Verify

- [x] `pnpm exec ava test/unit/link-opening.test.ts`
- [x] `pnpm run generate-schema`
- [x] After committing generated output: `pnpm run generate-schema && git diff --exit-code -- app/config/schema.json`
- [x] `rg -n 'webLinksOpenMode|open link' app lib typings test`
- [x] `pnpm run lint`
- [x] `pnpm exec tsc -b --pretty false`
- [x] `pnpm run test:unit`
- [x] `pnpm run dist && pnpm run test:e2e`
- [x] All implementation commits contain the trailer `Spec-ref: 002-external-link-browser-default`.
