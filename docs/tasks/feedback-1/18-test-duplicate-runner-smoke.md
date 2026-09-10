# Remove the duplicate happy-path fake-Codex smoke entry

Overview: [Review queue](00-overview.md)

Status: [x] Complete
Priority: P3

## Finding

`scripts/test_run_codex_tasks.py:98` (`smoke()`, CLI `--smoke`) repeats the same one-task temporary repository, fake-Codex executable and complete runner invocation as `EndToEndFakeCodexTests.test_reviewed_task_is_committed_and_runner_advances` at line 304. Both protect the happy implement→review→commit path. The separate failure-recovery and restart-recovery smoke functions exercise distinct paths and should remain.

The standalone smoke's extra total-commit/task-marker checks do not justify maintaining a duplicate workflow: `commit_task` already enforces completed task status, and the retained unittest verifies successful process completion, observed review output, final task commit and clean tree. Lost direct total-commit-count assertion must be recorded.

## Proposed work

After approval, remove `smoke()` and only its `--smoke` dispatch, plus current documentation referring to that duplicate invocation. Keep the canonical unittest and `--recovery-smoke` / `--resume-smoke` intact. Do not merge everything into one giant test.

## Acceptance

Exact removal approved. Eight original unittest entries minus any separately approved removal remain discoverable; safe recovery/resume scripts pass with fake Codex only. No source runner changes and no actual Codex task sessions. Clearly document the retained command for happy-path checking.

Evidence: [test audit](test-review/test-audit.md), runner/smoke() and runner/EndToEndFakeCodexTests. Confidence: high by full lifecycle inspection; surviving unittest passed in this audit.

## Implementation and verification

Completed 2026-09-10 against clean input `3af1cf270b786f4164d4d0d72b3e4aed17192fb0`. The owner request approved the exact listed deletion. Removed only `smoke()` and its dispatch (27 lines); all helpers, unittests, recovery/resume smokes and production runner remain unchanged. No repository or ancestor AGENTS.md exists on disk; supplied working agreements apply.

Retained happy-path command: `python3 -B -m unittest scripts.test_run_codex_tasks.EndToEndFakeCodexTests.test_reviewed_task_is_committed_and_runner_advances`. The direct happy-path total-commit-count assertion is lost; completed status is still enforced by `commit_task`.

Full runner discovery and execution passed all 10 cases; both `--recovery-smoke` and `--resume-smoke` passed using isolated temporary Git repositories and fake Codex only. The deliberate failed first review recovered successfully. Exact deletion and temporary-root cleanup were verified; `git diff --check` passed. Counts reconcile as eight original unittests minus task 14's approved deletion plus three regressions added by tasks 04/11. See the [audit update](test-review/test-audit.md#task-18-cleanup--2026-09-10) and `.test-artifacts/feedback-1-task-18/` logs.

No browser, Node/audio suite, build, live/paid smoke or actual Codex task session ran or was required. No owner acceptance gate, staging or repository commit.
