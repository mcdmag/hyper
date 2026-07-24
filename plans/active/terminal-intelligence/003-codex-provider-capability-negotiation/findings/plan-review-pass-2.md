# Plan review pass 2: drift, security, and delivery executability

**Lens**: full-pass-2 standard reviewer fallback  
**Persona**: `engineering-software-architect` unavailable (`PERSONA_NOT_FOUND`)  
**Checklist**: `ck_e02e1d11-3eb`

<verdict>PASS</verdict>
<checklist-token>ck_e02e1d11-3eb</checklist-token>

## Overall assessment

The plan is ready for autonomous implementation after three net-new corrections:
modern-shape login now has direct regression coverage, the installed-Codex check
is an executable redacted smoke script rather than prose, and delivery commands
now target `dev` unambiguously before packaging from the fast-forwarded primary
checkout. Capability acceptance remains fail closed and does not turn future
Codex versions into an unconditional allowlist.

The review tool's generated worktree/post-review instructions incorrectly
reported `main` as the base and included `main` PR commands. Those generated
commands were not executed and are not part of the reviewed plan; the plan now
explicitly requires `--base dev`, merge into `dev`, primary-checkout
fast-forward, and post-merge packaging/relaunch.

## Findings and fixes by lens

- **Goal alignment / runtime integration (HIGH, fixed):** The prior plan proved
  modern startup only through `account/read`, while the user reported login
  failure. Task 05 now exercises `login()` with the modern 0.145 provenance
  shape and proves the existing HTTPS `account/login/start` path is reached.
  This matches the production chain at `app/ui/window.ts:111-122` and
  `app/nli/service.ts:229-263`.
- **Testing / autonomous executability (HIGH, fixed):** “Invoke the compiled
  provider” was not copy-pasteable and could invite secret-bearing ad hoc
  output. Tasks 05 and 07 now require
  `scripts/test-nli-codex-provider.cjs`, which calls only `getAuthStatus()`,
  prints only the status enum, and removes unique temporary state. The provider
  boundary being exercised is `app/nli/codex-app-server.ts:227-230`; the public
  auth state deliberately exposes no tokens at `typings/nli.d.ts:60-69`.
- **Build pipeline / deployment (HIGH, fixed):** Task 07 named the desired PR
  outcome but omitted exact create/merge commands and listed packaging before a
  machine-verifiable merged-`dev` checkout. It now resolves or creates the PR
  with `--base dev`, merges that exact URL, verifies the merge, fast-forwards
  the primary `E:\repo\hyper` checkout while it is on `dev`, stops only the
  exact deployed binary, packages from that primary checkout, runs packaged
  smoke, and relaunches. The smoke script's real source/package boundary is
  `scripts/test-nli-packaged.ps1:51-57` and its isolated-profile assertions are
  `scripts/test-nli-packaged.ps1:67-77,169-184`.
- **Security / update-drift resilience (PASS):** The plan removes version
  branding and recursive metadata as acceptance proxies but still requires
  explicit keyring, approval, sandbox, web, and feature evidence. This is the
  correct leverage point over the brittle gates at
  `app/nli/codex-app-server.ts:451-467,475-491`; it does not weaken the hidden
  non-shell spawn, environment allowlist, JSONL bounds, or server-request
  denial at `app/nli/codex-app-server.ts:111-127,423-449,533-568`.
- **API / state / error contracts (PASS):** No HTTP, renderer RPC, public
  provider, or config schema changes are introduced. The existing typed error
  and safe renderer mapping remain at `app/nli/codex-app-server.ts:99-109` and
  `app/nli/service.ts:656-697`.
- **Migration / documentation / rollback (PASS):** No configuration migration
  or credential rewrite is introduced. Task 06 updates the authoritative guide,
  and rollback remains a `dev` revert plus the same package gate and redeploy.
- **Visual design (N/A):** No renderer state, copy, or interaction changes; no
  mockup task is warranted.
- **Adaptive tasks (PASS):** No adaptive tasks or adaptive-suggest markers.

## Prioritized action items

| Priority | Result |
| --- | --- |
| Critical | None remaining |
| High | Modern login, executable live smoke, and exact `dev` delivery gaps fixed |
| Medium | Generated `main` instructions explicitly excluded from the plan |
| Low | None remaining |

## Verification

- All 17 plan-review MUST items confirmed; token
  `ck_e02e1d11-3eb`.
- Placeholder scan returned no matches.
- All eight tasks contain runnable `## Verify` sections.
- No plan command targets `main`; the delivery contract explicitly targets
  `dev`.
- `git diff --check` passed (line-ending normalization warnings only).
- No runtime tests were run because this was a plan-only review.
- No commit, push, PR creation/merge, source implementation, or package action
  was performed by this pass.

## Source reading attestation

Read end-to-end independently during this pass:

- `app/nli/codex-app-server.ts` lines 1-693
- `test/unit/nli-codex-app-server.test.ts` lines 1-822
- `app/nli/service.ts` lines 1-784
- `app/ui/window.ts` lines 1-534
- `typings/nli.d.ts` lines 1-369
- `docs/natural-language-interface.md` lines 1-220
- `test/fixtures/nli/codex-app-server-0.144.6-v2-subset.json` lines 1-116
- `scripts/test-nli-packaged.ps1` lines 1-207
