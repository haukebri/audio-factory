# Project review — feedback 1

Review complete: 2026-09-10. Source revision: `c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef`; initial worktree clean. Four parallel reviewers covered code/operations, Studio UX, local security, and the complete test suite. Product code and existing tests remain unchanged.

## Result

**18 open implementation/cleanup proposals: 4 P1, 10 P2, 4 P3.** The project has useful safeguards and substantial behavioral coverage, but these defects should be addressed before treating it as finished. P1 tasks protect paid-operation intent, exact winner selection, live backend ownership, and required independent review. P2 tasks fix supported-flow failures, responsiveness, recovery, and important test gaps; P3 tasks remove low-value test maintenance.

| Order | Priority | Status | Task |
| --- | --- | --- | --- |
| 01 | P1 | [x] | [Coalesce repeated clicks on paid batch recreation](01-ux-batch-recreation-double-submit.md) |
| 02 | P1 | [x] | [Preserve new user intent when recovering pending Studio mutations](02-ux-selection-recovery-intent.md) |
| 03 | P1 | [x] | [Serialize access to the checkout-wide local backend across workflow roots](03-code-shared-backend-ownership.md) |
| 04 | P1 | [x] | [Recover unfinished runner transactions before trusting task checkboxes](04-code-runner-review-recovery.md) |
| 05 | P2 | [x] | [Allow manual trimming across the full supported 60-second source](05-code-sixty-second-trim.md) |
| 06 | P2 | [x] | [Keep retained audio and candidate lineage consistent](06-code-retain-source-lineage.md) |
| 07 | P2 | [ ] | [Recover incomplete signal dependency setup](07-code-setup-readiness.md) |
| 08 | P2 | [ ] | [Avoid synchronously rereading all audio on every Studio poll](08-code-polling-audio-revalidation.md) |
| 09 | P2 | [ ] | [Refresh human decisions independently of candidate audio](09-ux-review-state-refresh.md) |
| 10 | P2 | [ ] | [Pause variation-card playback when leaving the listening view](10-ux-hidden-variation-playback.md) |
| 11 | P2 | [ ] | [Use live operation evidence before restarting quiet task work](11-code-runner-silence-deadline.md) |
| 12 | P2 | [ ] | [Remove six obsolete scenarios from the browser acceptance script](12-test-obsolete-browser-scenarios.md) |
| 13 | P2 | [ ] | [Add a current synthetic browser check for the primary review workflow](13-test-current-browser-workflow.md) |
| 14 | P2 | [ ] | [Remove the dry-run test whose oracle permits losing tracked edits](14-test-dry-run-oracle.md) |
| 15 | P3 | [ ] | [Remove the obsolete live CLAP smoke script](15-test-obsolete-judge-smoke.md) |
| 16 | P3 | [ ] | [Remove assertions that pin editable progress and tool-output prose](16-test-editable-copy-assertions.md) |
| 17 | P3 | [ ] | [Delete the absent-budget equality left in sound grouping coverage](17-test-absent-budget-assertion.md) |
| 18 | P3 | [ ] | [Remove the duplicate happy-path fake-Codex smoke entry](18-test-duplicate-runner-smoke.md) |

## Review evidence

- [Code and operational review](code-review/review.md): end-to-end source tracing plus isolated runnable reproductions for setup, retention, backend ownership, polling and runner recovery.
- [UX review](ux-review.md): real synthetic Studio/browser checks at desktop/mobile sizes; observed state transitions and intercepted paid submissions. No provider credits were used.
- [Security report](security-review/report.md) and [erratum/interpretation](security-review/notes.md): no confirmed vulnerability under the local single-user, trusted-checkout model. First-party static review included authentication, browser isolation, secrets, paths, subprocesses, artifact integrity, and paid-request receipts. No online CVE lookup or third-party/native binary audit was performed.
- [Test-suite audit](test-review/test-audit.md), [production-first model](test-review/project-model.md), and [70-unit inventory](test-review/inventory.json): 57 groups meet the retention standard, 4 contain bad assertions, and 9 are bad. This is a review, not a cleaned suite. The exact deletion targets and lost partial protection are recorded in tasks 12 and 14–18.

## Verification and limits

`pnpm build` passed. The safe baseline passed 26 registered Node cases, 2 signal Python tests, 8 runner unittest cases, and the fake-runner recovery/resume smokes. The complete canonical package command was **not** run: its standalone bootstrap entry installs dependencies, prohibited by the test-review skill during analysis. That entry was fully inspected, with no inherited execution pass claimed. The obsolete browser script and real/paid smokes were inspected but not executed; fresh targeted synthetic browser checks ran separately.

No real model sound-quality acceptance, fresh model installation, paid provider call, deployment or publication is claimed. Historic license closure remains governed by the recorded owner resolution. Tests passing do not invalidate the reproduced defects or replace human listening review.

## Using this queue

Each numbered file is one actionable finding with evidence, scope and acceptance checks. The order groups high-impact fixes first; independent fixes may be implemented in parallel when they do not overlap. Coordinate Studio pending-intent fixes (01–02), store/refresh work (08–09), and browser cleanup/new coverage (12–13). Product fixes should leave a small regression for the observed fault rather than expanding into broad test rewrites.

This request authorized the review and task creation. No implementation or test cleanup was performed. Future test deletions require approval of their concrete listed targets under the requested test-review skill; the proposals are ready for that review. Preserve user data, use isolated synthetic fixtures, and never validate with accidental paid generation. The existing task runner can discover these numbered files, but task 04 identifies a runner recovery defect to fix before trusting interrupted execution of the queue.

Only review artifacts and owned ignored test fixtures were created. Code diagnostics cleaned their temporary roots/processes; the UX report records its stopped fixture and preserved synthetic evidence. No real library or user audio was modified.
