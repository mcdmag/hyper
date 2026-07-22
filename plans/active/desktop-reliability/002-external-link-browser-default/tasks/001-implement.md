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

- [ ] Add a failing `test/unit/link-opening.test.ts` matrix for direct HTTP(S), `about:blank`, malformed/unsupported URLs, external-launch rejection, secure internal options, nested requests, repeated child close, and config default/profile merge.
- [ ] Add `app/utils/link-opening.ts` with deterministic URL decisions, redacted external-launch errors, hardened internal BrowserWindow options, and idempotent owner recovery.
- [ ] Add `webLinksOpenMode: 'system' | 'internal'` to the default config and public type; regenerate `app/config/schema.json`.
- [ ] Add typed `open link` RPC plumbing and route terminal plus notification hyperlinks through it; preserve existing explicit `open external` and Help/menu behavior.
- [ ] Refactor `app/ui/window.ts` so `will-navigate` alone owns dropped URL behavior, `setWindowOpenHandler` enforces the current profile policy, and `did-create-window` manages each internal child.
- [ ] Extend `test/index.ts` with a packaged Electron seam test for system-mode no-child behavior and internal popup close-to-owner continuity.
- [ ] Run the full verification set, update plan evidence if implementation paths differ, and call `cue_plan_promote` before `cue_done` if Cue's lightweight scope guard reports more than two new files or 100 changed lines; promotion must not defer any requested behavior.

## State Contracts

| Boundary | Contract |
| --- | --- |
| Renderer -> main | `open link` carries only `{url: string}`; the renderer neither opens the URL nor logs it. |
| Main config -> policy | Read the owning profile's live `webLinksOpenMode` at request time; omitted/invalid resolves to `system`. |
| Policy -> Electron | System launches once and denies the child; internal allows one hardened HTTP(S) child or guarded transient `about:blank`; invalid/unsupported denies. |
| Child -> owner | `closed` restores/shows/focuses a non-destroyed owner exactly once without reload, renderer replacement, or PTY/session mutation. |
| Failure -> user | External-launch rejection produces a URL-redacted error diagnostic and non-blocking Hyper notification; owner state is unchanged. |

## Acceptance Criteria

- [ ] With the key omitted, root config omitted, or profile override omitted, effective mode is `system`; an explicit profile `internal` value survives merge and reload.
- [ ] System mode opens each HTTP(S) request exactly once through mocked `shell.openExternal`, creates zero child windows, and catches rejection without changing owner URL, renderer process, or sessions.
- [ ] Internal mode creates one child whose options set `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `outlivesOpener: false`.
- [ ] Invoking recovery more than once in unit tests is idempotent; across repeated real popup cycles the same owner becomes visible/focused, its captured frame is non-empty, its URL/renderer/session IDs are unchanged, and BrowserWindow count returns to baseline.
- [ ] Malformed URLs, unsupported protocols, and system-mode `about:blank` requests are denied without shell launch or child creation; an internal transient `about:blank` child cannot later navigate to an unsupported protocol.
- [ ] Nested popup attempts are subject to the same allowlist and lifecycle policy.
- [ ] Existing `open external` RPC and Help/menu system-browser behavior remain unchanged.
- [ ] External-launch diagnostics never contain the requested URL, and no telemetry event is introduced.
- [ ] Generated schema exposes the two enum values and is stable on a second generation.

## Verify

- [ ] `pnpm exec ava test/unit/link-opening.test.ts`
- [ ] `pnpm run generate-schema`
- [ ] After committing generated output: `pnpm run generate-schema && git diff --exit-code -- app/config/schema.json`
- [ ] `rg -n 'webLinksOpenMode|open link' app lib typings test`
- [ ] `pnpm run lint`
- [ ] `pnpm exec tsc -b --pretty false`
- [ ] `pnpm run test:unit`
- [ ] `pnpm run dist && pnpm run test:e2e`
- [ ] All implementation commits contain the trailer `Spec-ref: 002-external-link-browser-default`.
