# Task 07: Verify, package, publish, merge, and redeploy

## In plain English

Prove the fix in source and packaged Hyper, then deliver through the requested GitHub flow. Finish with local/remote dev on merged history and packaged Hyper relaunched for testing.

## Work

- [ ] Run focused tests, lint, TypeScript, full unit suite, and production build.
- [ ] Run compiled provider against installed Codex and require auth state, not incompatible.
- [ ] Review/commit with a Spec-ref trailer, push the feature branch, create the PR explicitly with `--base dev`, and merge that exact PR into `dev`.
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
- [ ] Run `node scripts/test-nli-codex-provider.cjs "$((Get-Command codex).Source)"`; require exactly `signed-out` or `signed-in`, never `NLI_CODEX_INCOMPATIBLE`, and do not start or complete OAuth.
- [ ] Set `$featureBranch = 'feature/terminal-intelligence/003-codex-provider-capability-negotiation'`; run `git push -u origin $featureBranch`; set `$prUrl = gh pr list --head $featureBranch --base dev --state open --json url --jq '.[0].url'`; if `$prUrl` is empty, set it from `gh pr create --base dev --head $featureBranch --title 'fix(nli): negotiate Codex provider capabilities' --body 'Removes brittle version/metadata compatibility gates while preserving fail-closed isolation.'`; require a non-empty URL and run `gh pr merge $prUrl --merge`.
- [ ] Run `gh pr view $prUrl --json baseRefName,mergeCommit,state --jq '{base: .baseRefName, state: .state, merge: .mergeCommit.oid}'` and require base `dev`, state `MERGED`, and a non-empty merge OID.
- [ ] Set `$devRepo = 'E:\repo\hyper'`; require `git -C $devRepo branch --show-current` to equal `dev`; run `git -C $devRepo fetch origin dev`, `git -C $devRepo merge --ff-only origin/dev`, and `git -C $devRepo rev-parse HEAD origin/dev`; require the two hashes to match before packaging/relaunch.
- [ ] Resolve `$deployedBinary = [IO.Path]::GetFullPath((Join-Path $devRepo 'dist\win-unpacked\Hyper.exe'))`, stop only processes whose resolved `ExecutablePath` equals that exact path, then run `pnpm --dir $devRepo run build`, `pnpm --dir $devRepo exec electron-builder --win dir --x64 --publish never`, `pnpm --dir $devRepo test:e2e`, and `powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $devRepo 'scripts\test-nli-packaged.ps1')`; require all commands to exit zero.
- [ ] Relaunch with `Start-Process -FilePath $deployedBinary`, then query `Win32_Process` and require a live process whose resolved `ExecutablePath` equals `$deployedBinary`.
- [ ] Run `git status --short` in both worktree and primary repo and confirm only known unrelated pre-existing files remain uncommitted.
