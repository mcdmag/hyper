
# Task 10: Final integration, review, and dev delivery

## In plain English

Run the complete feature as a user would, close remaining gaps, and deliver it through the repository's dev branch workflow.

## Work

- [ ] Re-read goal context, vision, every acceptance criterion, blindspot report, and all three plan-review findings.
- [ ] Run the complete verification matrix and inspect git diff for secrets, generated noise, unrelated changes, and interface drift.
- [ ] Exercise valid, valid-failing, natural-language missing command, alternatives, edit/reapproval, reject, sign-in/cancel, offline, generated failure, two panes, and unsupported cmd.exe with deterministic automation plus the optional live smoke.
- [ ] Exercise the unpacked Windows app to confirm one Hyper app, hidden Codex child, and no dangling console/process.
- [ ] Update understand.md and summary.md only after all tasks pass.
- [ ] Commit intentionally, push, open a PR explicitly against dev, merge after checks, and fast-forward local dev while preserving unrelated .cue/memory content.

## Acceptance

- [ ] Every required command passes or a concrete environment-only limitation has equivalent deterministic evidence.
- [ ] No mandatory task remains.
- [ ] The PR base is dev, the merged commit is reachable from origin/dev, and local dev is fast-forwarded.
- [ ] The final report links implementation, tests, docs, and correctness-deferred shell adapters.

## Verify

- [ ] Run: pnpm test
- [ ] Run: pnpm run build
- [ ] Run: pnpm exec electron-builder --win dir --x64 --publish never
- [ ] Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-nli-packaged.ps1
- [ ] Run: pnpm test:e2e
- [ ] Run: gh pr view --json baseRefName,headRefName,state,mergeCommit
- [ ] Run: git merge-base --is-ancestor origin/dev dev
