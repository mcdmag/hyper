
# Task 10: Final integration, review, and dev delivery

## In plain English

Run the complete feature as a user would, close remaining gaps, and deliver it through the repository's dev branch workflow.

## Work

- Re-read goal context, vision, all task acceptance criteria, blindspot report, and the three plan-review findings.
- Run the complete verification matrix and inspect git diff for secrets, generated noise, unrelated changes, and interface drift.
- Manually exercise a valid command, a valid failing command, natural-language command-not-found, multiple alternatives, edit/reapproval, reject, sign-in/cancel, offline, generated-command failure, two panes, and unsupported cmd.exe behavior.
- Exercise the unpacked Windows app to confirm one Hyper app with a hidden Codex subprocess and no dangling terminal.
- Update understand.md and summary.md only after all tasks pass.
- Commit intentionally, push the feature branch, open a PR explicitly against dev, merge only after required checks, and fast-forward the local dev worktree. Preserve unrelated untracked .cue/memory content.

## Acceptance

- Every required command passes or a concrete environment-only limitation is recorded with equivalent evidence.
- No mandatory task remains.
- The PR base is dev, the merged commit is reachable from origin/dev, and local dev is fast-forwarded.
- The final report links implementation, tests, docs, and any intentionally deferred shell adapters.
