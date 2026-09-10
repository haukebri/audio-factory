# Recover unfinished runner transactions before trusting task checkboxes

Overview: [Review queue](00-overview.md)

Status: [x]
Priority: P1
Area: code / reliability

## Finding

Implementation marks Status [x] before independent review. If the runner is killed in that window, the next run skips the completed checkbox before inspecting active-task.json. With one task it reports success, leaving unreviewed changes and active state behind; with later tasks, load_state can discard that state and checkpoint the changes without the required review.

Source: `scripts/run_codex_tasks.py:751–760,819–829` (revision `c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef`).

## Evidence

`python3 docs/tasks/feedback-1/code-review/reproduce-runner.py` reproduced exit 0, “All tasks complete”, review_was_called=false, active_state_remains=true, unreviewed_task_still_dirty=true in an isolated Git repository.

## Requested change

Reconcile the durable active transaction before skipping completed tasks. Treat a checkbox as implementation progress until the runner has recorded successful review/commit. Preserve the original review base across restart.

## Acceptance

An abrupt stop after the implementation status write resumes independent review; it cannot report completion or advance to the next task first. A genuinely reviewed and committed task still resumes without duplicate work.

## Completion evidence

Completed 2026-09-10. The runner loads and reconciles the active transaction before skipping task checkboxes. Unfinished work uses the existing recovery checkpoint and implementation/review retry flow, retaining its original review base and recording the new recovery checkpoint. The runner records the approved Git tree and parent before committing, so a restart after the commit recognizes completed work without repeating implementation or review and preserves any required owner pause.

- The original isolated reproduction confirmed skipped review before the fix. The new restart regression fails against the original runner (seven failing scenarios).
- `python3 -m unittest scripts.test_run_codex_tasks`: 10 tests passed, including abrupt stops after the implementation status write, during review, after approval but before commit, and after commit; single-task and multi-task queues; normal completed reruns; and owner-pause recovery.
- `python3 scripts/test_run_codex_tasks.py --smoke`, `--recovery-smoke`, and `--resume-smoke`: all passed using fake Codex and temporary Git repositories. Fixture repositories were removed by their context cleanup.
- `git diff --check`: passed. No browser, application build, model, paid-provider, or real Codex smoke was run; none is required for this runner-only task. No commit was made in this checkout.
