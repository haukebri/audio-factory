# Remove the duplicate happy-path fake-Codex smoke entry

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
Priority: P3

## Finding

`scripts/test_run_codex_tasks.py:98` (`smoke()`, CLI `--smoke`) repeats the same one-task temporary repository, fake-Codex executable and complete runner invocation as `EndToEndFakeCodexTests.test_reviewed_task_is_committed_and_runner_advances` at line 304. Both protect the happy implement→review→commit path. The separate failure-recovery and restart-recovery smoke functions exercise distinct paths and should remain.

The standalone smoke's extra total-commit/task-marker checks do not justify maintaining a duplicate workflow: `commit_task` already enforces completed task status, and the retained unittest verifies successful process completion, observed review output, final task commit and clean tree. Lost direct total-commit-count assertion must be recorded.

## Proposed work

After approval, remove `smoke()` and only its `--smoke` dispatch, plus current documentation referring to that duplicate invocation. Keep the canonical unittest and `--recovery-smoke` / `--resume-smoke` intact. Do not merge everything into one giant test.

## Acceptance

Exact removal approved. Eight original unittest entries minus any separately approved removal remain discoverable; safe recovery/resume scripts pass with fake Codex only. No source runner changes and no actual Codex task sessions. Clearly document the retained command for happy-path checking.

Evidence: [test audit](test-review/test-audit.md), runner/smoke() and runner/EndToEndFakeCodexTests. Confidence: high by full lifecycle inspection; surviving unittest passed in this audit.
