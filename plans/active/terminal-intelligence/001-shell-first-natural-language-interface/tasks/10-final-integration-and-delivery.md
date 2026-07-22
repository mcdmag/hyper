
# Task 10: Final integration, review, and dev delivery

## In plain English

Run the complete feature as a user would, close remaining gaps, and deliver it through the repository's dev branch workflow.

## Work

- [x] Re-read goal context, vision, every acceptance criterion, blindspot report, and all three plan-review findings.
- [x] Run the complete verification matrix and inspect git diff for secrets, generated noise, unrelated changes, and interface drift.
- [x] Exercise valid, valid-failing, natural-language missing command, alternatives, edit/reapproval, reject, sign-in/cancel, offline, generated failure, two panes, and unsupported cmd.exe with deterministic automation plus the optional live smoke.
- [x] Exercise the isolated unpacked Windows app to confirm one Hyper GUI, no child top-level window, and no dangling descendant; verify the real Codex `windowsHide: true` and cleanup contract through the provider seam.
- [x] Update understand.md and summary.md only after all tasks pass.
- [x] Run git fetch origin dev; push the feature branch; run gh pr create --base dev --head feature/terminal-intelligence/001-shell-first-natural-language-interface; run gh pr checks --watch; merge that PR into dev; then from E:\repo\hyper run git pull --ff-only origin dev while preserving unrelated .cue/memory content.

## Acceptance

- [x] Every required command passes or a concrete environment-only limitation has equivalent deterministic evidence.
- [x] No mandatory task remains.
- [x] The PR base is dev, the merged commit is reachable from origin/dev, and local dev is fast-forwarded.
- [x] The final report links implementation, tests, docs, and correctness-deferred shell adapters.

## Verify

- [x] Run: pnpm test
- [x] Run: pnpm run build
- [x] Run: pnpm exec electron-builder --win dir --x64 --publish never
- [x] Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-nli-packaged.ps1
- [x] Run: pnpm test:e2e
- [x] Run: gh pr view --json baseRefName,headRefName,state,mergeCommit and assert baseRefName=dev plus merged state.
- [x] Run from E:\repo\hyper: git fetch origin dev; compare git rev-parse dev to git rev-parse origin/dev for exact equality; verify the PR mergeCommit is an ancestor of origin/dev.
