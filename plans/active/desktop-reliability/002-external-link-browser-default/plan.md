---
spec_id: 2
slug: external-link-browser-default
mode: lightweight
epic: desktop-reliability
created: 2026-07-22
promoted_to: null
---

## Problem

Opening a link through Hyper's internal Electron browser popup can leave the owning Hyper window blank and unrecoverable after the popup closes, forcing the user to quit Hyper. Hyper needs a configurable link-opening policy that defaults to the operating system browser for existing and new profiles, while retaining a safe internal-popup opt-in and preserving the terminal session when that popup closes.

## Root Cause

The current link paths are split and have no shared lifecycle policy. Terminal links in `lib/components/term.tsx` already call `shell.openExternal`, but generic renderer/plugin requests reach `app/ui/window.ts::setWindowOpenHandler`. That handler reuses drag/drop parsing, denies only recognized file/HTTP(S) cases, and returns `allow` for every other request. Electron can therefore create a child BrowserWindow that bypasses Hyper's `app.createWindow`, `windowSet`, cleanup, and focus-restoration path. There is no `did-create-window` handler to recover the owner after the child closes, and discarded `shell.openExternal` promises provide no failure recovery.

The exact reported trigger may be a direct URL or an `about:blank` popup followed by navigation, so implementation must first capture the handler details (`url`, `disposition`, and `frameName`) in a failing regression test. The current-code boundary above is established; the test must pin down which branch produces the blank state before changing behavior.

## Change

1. Add `config.webLinksOpenMode` with values `'system'` and `'internal'`. Set `'system'` in `config-default.json`. Existing config files need no rewrite: `app/config/init.ts` merges missing keys from the shipped defaults, so both existing and new profiles receive the system-browser default while profile overrides remain supported and hot-reloaded.
2. Separate dropped-navigation parsing from new-window link policy. Extract a small, testable main-process link controller that parses URLs defensively, accepts only intended web protocols, and returns deterministic deny/system/internal outcomes. Invalid URLs, unsafe schemes, and default-mode `about:blank` requests must not create a popup.
3. Route safe HTTP(S) new-window requests through `shell.openExternal` in system mode and return `deny` to Electron. Catch rejection, notify the user without navigating/reloading Hyper, and leave the owner window and PTY sessions intact.
4. In internal mode, allow only safe web URLs with hardened child options (`nodeIntegration: false`, `contextIsolation: true`, sandboxing enabled, no outliving the opener). Register `did-create-window` lifecycle handling: nested popups are denied or routed through the same policy, and child close restores/shows/focuses the owner without reloading it or invoking main-window cleanup.
5. Keep existing explicit system-link call sites compatible. Cover the generic `window.open` boundary used by renderer/plugin links; only consolidate direct renderer calls if the reproduction proves they bypass the affected boundary.
6. Regenerate the checked-in JSON schema and add focused tests for default merging, decision routing, external-launch failure, secure internal-window options, and idempotent owner recovery.

The mandatory Cue blindspot pass informed this plan but was not attached to goal context because no user was available to confirm it during the automatic continuation.

## Public API

`config.webLinksOpenMode: 'system' | 'internal'` (default: `'system'`)

## Decisions

- Apply the system-browser default to all profiles, including existing user configs that omit the key; this follows the requested default and the repository's non-destructive default-merge mechanism.
- Preserve internal browsing as an explicit opt-in instead of removing it.
- Enforce policy in the Electron main process, where the live profile config, BrowserWindow lifecycle, URL validation, and `shell.openExternal` are authoritative.
- Do not reload the owner as recovery: `app/ui/window.ts` destroys PTY sessions after subsequent main-window navigation.
- Harden internal remote content rather than inheriting Hyper's privileged renderer preferences.
- Treat the exact popup trigger as a test-first implementation fact, not an assumption; current xterm links already use the OS browser.

## Alternatives Considered

- Remove internal browsing entirely: rejected because the requested behavior retains it as an option.
- Change only `WebLinksAddon`: rejected because that path already opens the OS browser and would miss renderer/plugin `window.open` popups.
- Keep returning `allow` and merely refocus later: rejected because it preserves an untracked, privileged child-window path and does not cover launch or navigation failures.
- Reload Hyper after popup close: rejected because it risks destroying live sessions and masks the lifecycle defect.
- Restore the legacy in-terminal `<webview>`: rejected because that implementation was removed from current Hyper and would add a second browser lifecycle.

## Files Touched

Expected implementation surface:

- `app/ui/window.ts` — install the link policy, system launch handling, and managed child recovery.
- `app/utils/link-opening.ts` (new) — pure URL/policy decisions and testable lifecycle helpers.
- `app/config/config-default.json` — system-browser default.
- `typings/config.d.ts` — public configuration contract and documentation.
- `app/config/schema.json` — generated schema output.
- `test/unit/link-opening.test.ts` (new) — policy and lifecycle regression matrix.
- A focused config-init test file or an existing suitable unit test — prove omitted versus explicit mode semantics.

If the verified trigger requires renderer plumbing, limit the additional edits to the proven call site and typed RPC contract; promote this lightweight plan before implementation if the change exceeds Cue's two-new-file or 100-LOC guardrail.

## Verification

1. Reproduce the defect in vanilla Hyper or a BrowserWindow/WebContents harness and record the `setWindowOpenHandler` details. Add a failing test proving child close leaves the owner recovery path absent before the fix.
2. Unit-test the policy matrix:
   - omitted/`system` + HTTP(S) calls `shell.openExternal`, returns `deny`, and creates no child;
   - explicit `internal` + HTTP(S) permits one hardened child;
   - malformed, unsupported, and default-mode `about:blank` requests are denied;
   - external launch rejection notifies and leaves the owner usable.
3. Unit-test internal child close/destroy handling with fake windows: owner is restored and focused once, its URL is unchanged, no reload occurs, and no session cleanup callback runs.
4. Test config merging: a saved config without `webLinksOpenMode` resolves to `system`; an explicit `internal` root/profile override survives merge and config reload.
5. Run `pnpm run generate-schema`, then verify a second generation produces no diff in `app/config/schema.json`.
6. Run `pnpm run lint`, `pnpm exec tsc -b --pretty false`, and `pnpm run test:unit`.
7. Smoke-test on the current desktop OS:
   - default mode opens an HTTP(S) link in the OS browser with no Hyper popup;
   - internal mode opens one popup;
   - closing it returns to the same visible terminal with the same live PTY/session;
   - repeating the cycle does not blank Hyper or leak child windows.
   Run `pnpm run test:e2e` when a packaged binary is available; otherwise record the manual Electron smoke evidence.

## Commit Ref

Plan commit created by `cue_commit_plan`. Implementation commit is TBD and must include a `Spec-ref: 002-external-link-browser-default` trailer.
