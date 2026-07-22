# Understanding external-link policy and popup recovery

## TL;DR

Hyper now treats link opening as a main-process policy decision. HTTP(S) links open in the operating system browser by default. Users can opt into an internal Electron child window, but that child is sandboxed, owned by the Hyper window, and cannot leave the terminal blank when it closes. Recovery restores and focuses the existing owner without reloading its renderer or recreating PTYs.

## Concepts you need

**Renderer versus main process.** Terminal links and notification links begin in Hyper's renderer, but the renderer should not decide how to launch them. It sends the typed `open link` RPC to the main process, where Electron's `shell` and `BrowserWindow` APIs are controlled.

**Fail-closed URL policy.** `classifyLinkTarget` parses with the platform `URL` implementation and returns only `web`, `blank`, or `deny`. Only HTTP(S) and the exact bridge value `about:blank` are recognized. A malformed value or unsupported scheme is denied without being logged.

**Owner and child lifecycle.** An internal browser is a child of the existing Hyper `BrowserWindow`. `outlivesOpener: false` and an owner `closed` listener stop it from surviving Hyper. The inverse `closed` listener restores the owner exactly once.

**Privilege separation.** Hyper's terminal renderer is privileged enough to run the application. Remote web content is not. Internal children therefore force `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and disabled drag-to-navigate behavior.

## The system, in plain English

When a user activates a terminal or notification link, Hyper asks one controller what to do. With the normal configuration, that controller asks Windows to open the URL in the user's default browser and leaves the terminal window alone. If Windows rejects the request, Hyper shows a non-blocking error and records a generic diagnostic that does not reveal the URL.

Some pages and plugins create an empty popup first and navigate it later. In system mode Hyper allows only a hidden bridge window for that sequence. The first HTTP(S) navigation is redirected to the system browser, then the bridge is destroyed. Unsupported navigation or five seconds of inactivity also destroys it, so it never becomes a visible browser.

With `webLinksOpenMode: 'internal'`, Hyper creates a visible child. Closing it calls a one-shot recovery function: restore if minimized, show if hidden, focus the window, then focus its web contents. It never calls reload, replacement-window creation, or session cleanup, so the terminal and its PTYs stay intact.

## The system, with the jargon back in

`LinkOpeningController` is dependency-injected with the owner, live mode getter, child factory, external launcher, failure reporters, and timer functions. This makes Electron behavior deterministic in AVA without weakening the production boundary.

`handleWindowOpen` feeds the owner and every managed child's `setWindowOpenHandler`. Direct system HTTP(S) calls `openExternal` asynchronously and returns `deny`; system `about:blank` returns a hardened, hidden `allow`; internal web and blank targets return a hardened, visible `allow`. `did-create-window` then classifies the concrete child and installs either bridge management or internal-child management. A `WeakSet` prevents duplicate listener installation.

Internal children receive recursive popup policy plus `will-navigate` and main-frame `will-redirect` guards. A bridge receives a single idempotent `finish` path shared by navigation, timeout, and owner close. `createOwnerRecovery` is separately idempotent and checks destroyed state before touching either window or web contents.

`app/ui/window.ts` constructs the controller after profile decoration is available, reads `webLinksOpenMode` at request time, handles typed `open link` messages, and delegates `window.open` plus `did-create-window`. The old `open external` contract remains system-only for Help, menu, and plugin compatibility. Terminal and notification components no longer call Electron's external launcher directly.

## Decisions and what we rejected

- The default is `system`, including for old profiles that omit the key. Hyper's existing default merge supplies the value without rewriting user configuration.
- Internal browsing remains an explicit opt-in. Removing it would avoid popup lifecycle work but would remove requested behavior.
- Policy is centralized in main. Fixing only terminal hyperlinks would leave notifications and plugin `window.open` requests unmanaged.
- The owner is recovered in place. Reloading was rejected because Hyper's navigation cleanup can delete live PTY sessions.
- `about:blank` is a narrow, hidden bridge in system mode. Allowing an ordinary visible blank popup would reintroduce the untracked lifecycle.
- Unsupported protocols are denied. This feature does not become a general protocol dispatcher or file opener.
- Launch errors use a generic message. Logging raw destinations was rejected because URLs can contain sensitive query data.

## Watch out for

- Keep the `did-create-window` listener installed before popup requests can occur; otherwise an Electron-created child can escape lifecycle management.
- Do not reuse the owner `will-navigate` drag/drop path for popup policy. It may paste dropped paths into the active shell, which is wrong for ordinary links.
- Preserve the exact `about:blank` check. Broad `about:` handling would grant a bridge to targets this policy did not review.
- Do not move recovery toward `reload`, `loadURL`, or new-window replacement. The acceptance invariant is the same owner URL, renderer process, and PTY session IDs.
- Keep the owner-recovery packaged E2E scenario last. Its deliberate hide/minimize cycle can disrupt later Windows automation hooks even when the Electron and PTY identities remain stable.
- A rejected `loadURL` for a direct internal child destroys that child; changes to error UI must not navigate the owner.

## To go deeper

- [Feature plan](./plan.md)
- [Implementation task](./tasks/001-implement.md)
- [Task interaction flow](./flow/task-001-implement-external-link-policy-and-popup-.md)
- [`LinkOpeningController`](../../../../app/utils/link-opening.ts)
- [Policy and lifecycle unit matrix](../../../../test/unit/link-opening.test.ts)
- [Packaged Electron regression](../../../../test/index.ts)

This feature remained a lightweight plan because Cue's promoter could list the feature but could not resolve it for promotion; the shipped code, task, flow, and this implementation guide are the authoritative maintenance sources.

## Self-check

1. **Why does a system HTTP(S) popup return `deny`?**
   The URL has already been handed to the OS, so Electron must not create a second visible child.
2. **Why can `about:blank` return `allow` in system mode?**
   It is the only supported bridge for scripts that navigate after creating a popup; it is hidden, timed, guarded, and destroyed after the first navigation.
3. **What protects the terminal after an internal child closes?**
   Recovery operates on the same owner and never reloads it, so renderer and PTY identities are preserved.
4. **Where is the active preference read?**
   In the main-process controller's live mode getter at link-open time, not cached in the renderer.
5. **What should a new protocol do by default?**
   Fail closed until it is deliberately added to the classifier, security policy, and tests.
