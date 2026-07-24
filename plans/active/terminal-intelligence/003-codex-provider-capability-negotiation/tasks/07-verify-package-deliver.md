# Task 07: Verify, package, publish, merge, and redeploy

## In plain English

Prove the fix in source and packaged Hyper, then deliver through the requested GitHub flow. Finish with local/remote dev on merged history and packaged Hyper relaunched for testing.

## Work

- [ ] Run focused tests, lint, TypeScript, full unit suite, and production build.
- [ ] Run compiled provider against installed Codex and require auth state, not incompatible.
- [ ] Review/commit with Spec-ref trailer; create PR, merge, and fast-forward dev.
- [ ] Verify primary `dev` and `origin/dev` contain the merge commit before packaging.
- [ ] Stop only deployed Hyper processes, rebuild/package from merged `dev`, run packaged smoke, and relaunch.
- [ ] Write completion artifacts and verify git/deployment provenance.

## Acceptance

- [ ] Tests/build/package pass and live provider reaches auth state.
- [ ] PR merges into dev; local/remote dev contain merged history.
- [ ] Packaged app is relaunched from merged source.
- [ ] No unrelated changes are committed.

## Verify

- [ ] Run `pnpm exec ava test/unit/nli-codex-app-server.test.ts`, `pnpm run lint`, `pnpm exec tsc -b --pretty false`, `pnpm run test:unit`, and `pnpm run build`; require every command to exit zero.
- [ ] Invoke the compiled `CodexAppServerProvider` with `Get-Command codex` and require `getAuthStatus()` to return `signed-out` or `signed-in`, never `NLI_CODEX_INCOMPATIBLE`; redact account labels and do not start or complete OAuth.
- [ ] Run `pnpm exec electron-builder --win dir --x64 --publish never`, `pnpm test:e2e`, and `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-nli-packaged.ps1`; require all package checks to exit zero.
- [ ] Run `gh pr view --json baseRefName,mergeCommit,state --jq '{base: .baseRefName, state: .state, merge: .mergeCommit.oid}'` and require base `dev`, state `MERGED`, and a non-empty merge OID.
- [ ] Run `git -C E:\repo\hyper fetch origin dev`, `git -C E:\repo\hyper merge --ff-only origin/dev`, and `git -C E:\repo\hyper rev-parse HEAD origin/dev`; require the two hashes to match before packaging/relaunch.
- [ ] Run `git status --short` in both worktree and primary repo and confirm only known unrelated pre-existing files remain uncommitted.
