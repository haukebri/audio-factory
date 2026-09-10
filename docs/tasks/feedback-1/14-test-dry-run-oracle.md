# Remove the dry-run test whose oracle permits losing tracked edits

Overview: [Review queue](00-overview.md)

Status: [x] Complete
Priority: P2

## Finding

`scripts/test_run_codex_tasks.py:254` calls `checkpoint_dirty_tree(..., dry_run=True)` then checks only a nonempty Git status and unchanged commit count. Those surrogates do not establish the no-mutation dry-run behavior.

In an isolated copy, inserting `(root / "tracked.txt").write_text("DATA LOST\n")` inside the dry-run branch still let the unchanged test pass. Control, fault and restored runs all passed. This is a demonstrated defective central oracle, not a production data-loss finding. Production/test sources were never changed.

## Proposed work

After approval, remove `GitRecoveryTests.test_dry_run_reports_but_does_not_commit_dirty_tree`. Record the lost partial check that dry-run adds no commit and the preexisting gap that working/index bytes are preserved. Do not retain the test under a narrower name or add assertions solely to rescue it. A future focused byte/index-preservation regression is separate opt-in work if this guarantee needs renewed protection.

## Acceptance

Approve the exact removal before editing. Remaining runner unittest and safe fake-Codex recovery/resume checks pass. Report the gap honestly; do not claim dry-run no-mutation is covered after deletion. Never run a real task-runner Codex session to validate this cleanup.

Evidence: [fault/control/restoration log](test-review/dry-run-fault.log), [test audit](test-review/test-audit.md).

## Completion evidence

The owner request to implement this exact task authorized the named removal before edits. Removed only the listed unittest; no replacement or production changes. Lost partial protection: dry-run adds no commit and leaves a dirty status. Working-tree/index byte preservation was already a gap; dry-run no-mutation is not covered after deletion.

All 10 remaining runner unittests passed (`python3 -B -m unittest scripts.test_run_codex_tasks`), as did the fake-Codex `--smoke`, `--recovery-smoke` and `--resume-smoke` entries in `scripts/test_run_codex_tasks.py`. The deliberate first-review failure recovered successfully. All temporary repositories were removed and `git diff --check` passed. See the [audit update](test-review/test-audit.md#task-14-cleanup--2026-09-10); detailed logs and recovery evidence are in `.test-artifacts/feedback-1-task-14/`.

No browser, build, Node/audio or real-model/paid smoke checks were required or run. No real task-runner Codex session or repository commit was made. No post-implementation owner acceptance gate is required.
