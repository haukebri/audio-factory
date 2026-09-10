# Remove the obsolete live CLAP smoke script

Overview: [Review queue](00-overview.md)

Status: [x] Complete
Priority: P3

## Finding

`judge-smoke.mjs:25–32` requires newly generated `candidate.evaluation.model` and successful CLAP evidence. The current `runWorkflow` deliberately returns `evaluation: null`, and README removes CLAP execution and evaluation tools. The script can call the local prompt planner before inevitably failing its retired central outcome. This is not the compatibility contract to read/export historical evaluation metadata.

Confidence: high from current script/workflow/README inspection. Script was not executed because its retired outcome and planner side effect are already established.

## Proposed work

After approval, remove `judge-smoke.mjs` and references presenting it as a current runnable check. Preserve historical milestone evidence and the review-store tests that verify historical evaluation metadata remains readable/exportable. Do not rehabilitate this script into a new smoke test or restore CLAP.

## Acceptance

No current usage/check instruction directs users to this obsolete script. Existing signal, quality-loop and review-store tests still pass. Removed protection is new CLAP execution, which is explicitly unsupported; historical metadata compatibility remains covered.

Evidence: [test audit](test-review/test-audit.md), judge-smoke inventory unit.

## Implementation and verification — 2026-09-10

The owner's task request approved the exact listed removal. Deleted only `judge-smoke.mjs`; no replacement or production/test changes. Repository reference search found no current usage or package check invoking it. Remaining references describe historical milestone/source inventory evidence or the original review and are preserved. Removed protection is unsupported new CLAP execution; historical metadata compatibility tests remain unchanged.

- `pnpm build` passed.
- `node --test quality-loop.test.mjs review-store.test.mjs` passed all 4 tests, with no skips, including the model-free durable review smoke.
- `.runtime/signal-venv/bin/python -B qa_test.py` passed both signal tests.
- Fixture teardown completed, test processes exited, and no new top-level `.runtime` entries remained. `git diff --check` passed.

Logs, original script, mutation fingerprint and cleanup evidence are in `.test-artifacts/feedback-1-task-15/`. Browser checks, the full package suite, real generation/paid smoke, retired judge smoke and human listening were not run and are not required by this task. No model/planner/provider calls, dependency installation or commit occurred. No owner acceptance gate is required.
