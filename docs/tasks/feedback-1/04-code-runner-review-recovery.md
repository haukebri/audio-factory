# Recover unfinished runner transactions before trusting task checkboxes

Overview: [Review queue](00-overview.md)

Status: [ ]
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

No implementation change is included in this review.
