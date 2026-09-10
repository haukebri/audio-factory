# Delete the absent-budget equality left in sound grouping coverage

Overview: [Review queue](00-overview.md)

Status: [x] Complete
Priority: P3

## Finding

`studio-sound-grouping.test.mjs:28` compares `second.input.budget` to `input.budget`; both are undefined. The workflow explicitly rejects removed budgets. The test also assigns unused `job.budget_started_at` at line 16. This assertion can pass without any budget behavior existing and supplies no useful protection.

## Proposed work

After approval, delete the line-28 assertion and line-16 fixture-only obsolete assignment. Keep the existing real persistence, membership, conflict, explicit-seed and restart assertions unchanged; these independently justify the test.

## Acceptance

Exact cleanup plan approved, targeted Node test passes, no obsolete budget assertion or fixture field remains in this test. There is no meaningful protection lost; budget rejection remains exercised in quality-loop migration checks.

Evidence: [test audit](test-review/test-audit.md), sound-grouping/persistence. Confidence: high by direct inspection.

## Implementation and verification — 2026-09-10

The owner's implementation request approved the exact two-line cleanup. Removed only the absent-budget equality and unused `budget_started_at` assignment; every other test line remains unchanged. One persistence case remains, with no meaningful protection lost; budget rejection remains covered in the unchanged quality-loop migration checks.

- `node --test studio-sound-grouping.test.mjs`: passed (1/1), including an isolated temporary-root run; fixture cleanup verified.
- `pnpm build`: passed.
- `pnpm test:audio-factory`: 33/34 Node cases passed; the unchanged `qa.test.mjs:40` trim check failed (500 versus 400), matching the limitation recorded in task 16. Its Python step did not run.
- The same complete Node file list with `--test-concurrency=1`: passed (34/34); `.runtime/signal-venv/bin/python qa_test.py`: passed (2/2). No definitive cause of the concurrent failure is claimed.
- Exact two-line diff, absence of budget references, and `git diff --check`: verified. Logs and recovery copy: `.test-artifacts/feedback-1-task-17/`.

No browser, live-model, paid-generation smoke, or human listening check was required or run. No owner acceptance gate is required. No production changes or commit.
