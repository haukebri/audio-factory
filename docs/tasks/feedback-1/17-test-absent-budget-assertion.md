# Delete the absent-budget equality left in sound grouping coverage

Overview: [Review queue](00-overview.md)

Status: [ ] Not started
Priority: P3

## Finding

`studio-sound-grouping.test.mjs:28` compares `second.input.budget` to `input.budget`; both are undefined. The workflow explicitly rejects removed budgets. The test also assigns unused `job.budget_started_at` at line 16. This assertion can pass without any budget behavior existing and supplies no useful protection.

## Proposed work

After approval, delete the line-28 assertion and line-16 fixture-only obsolete assignment. Keep the existing real persistence, membership, conflict, explicit-seed and restart assertions unchanged; these independently justify the test.

## Acceptance

Exact cleanup plan approved, targeted Node test passes, no obsolete budget assertion or fixture field remains in this test. There is no meaningful protection lost; budget rejection remains exercised in quality-loop migration checks.

Evidence: [test audit](test-review/test-audit.md), sound-grouping/persistence. Confidence: high by direct inspection.
