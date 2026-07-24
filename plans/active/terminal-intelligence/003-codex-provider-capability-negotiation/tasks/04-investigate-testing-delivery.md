# Task 04: Define regression and delivery proof

## In plain English

Turn the diagnosis into a focused test matrix and realistic delivery check. Cover unit/full suites, live installed Codex, build/package, PR/merge, dev fast-forward, and relaunch.

## Work

- [ ] Locate provider, fixture, build, package, and smoke commands.
- [ ] Define modern, legacy, unsafe, malformed, and version-independent cases.
- [ ] Define secret-safe real-provider smoke and package provenance checks.

## Acceptance

- [ ] Every behavior has automated evidence and security negatives remain.
- [ ] Packaged proof is distinct from source proof.

## Verify

- [ ] Run `Get-Command codex, pnpm, gh | Select-Object Name, Source` and confirm all delivery tools resolve before implementation.
- [ ] Run `Get-Item scripts/test-nli-packaged.ps1, test/unit/nli-codex-app-server.test.ts, test/fixtures/nli/codex-app-server-0.144.6-v2-subset.json | Select-Object FullName, Length` and confirm the focused, fixture, and packaged seams exist.
- [ ] Run `pnpm exec electron-builder --help | Select-String 'win|dir|publish'` to confirm the local Windows package dry-run surface used by Task 07.
