# Remove the dry-run test whose oracle permits losing tracked edits

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
Priority: P2

## Finding

`scripts/test_run_codex_tasks.py:254` calls `checkpoint_dirty_tree(..., dry_run=True)` then checks only a nonempty Git status and unchanged commit count. Those surrogates do not establish the no-mutation dry-run behavior.

In an isolated copy, inserting `(root / "tracked.txt").write_text("DATA LOST\n")` inside the dry-run branch still let the unchanged test pass. Control, fault and restored runs all passed. This is a demonstrated defective central oracle, not a production data-loss finding. Production/test sources were never changed.

## Proposed work

After approval, remove `GitRecoveryTests.test_dry_run_reports_but_does_not_commit_dirty_tree`. Record the lost partial check that dry-run adds no commit and the preexisting gap that working/index bytes are preserved. Do not retain the test under a narrower name or add assertions solely to rescue it. A future focused byte/index-preservation regression is separate opt-in work if this guarantee needs renewed protection.

## Acceptance

Approve the exact removal before editing. Remaining runner unittest and safe fake-Codex recovery/resume checks pass. Report the gap honestly; do not claim dry-run no-mutation is covered after deletion. Never run a real task-runner Codex session to validate this cleanup.

Evidence: [fault/control/restoration log](test-review/dry-run-fault.log), [test audit](test-review/test-audit.md).
