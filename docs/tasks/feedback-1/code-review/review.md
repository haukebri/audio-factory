# Code and operational review

Revision: `c5ad0b28871a7a9c0b55433f2b0b334bb7a66bef`, initially clean. Reviewed 2026-09-10. Product source remained unchanged.

## Scope and approach

Read all TypeScript runtime modules, workflow/batch/store/retention/bundle/lineage modules, setup/downloader/launcher, planner, signal analyzer, smoke/corpus scripts, and task runner. Cross-checked active request/config/QA/export/run contracts, package commands, agent integration instructions and current usage docs. Historical milestones were context, with the recorded owner license resolution respected. UX/browser and complete test retention review were assigned to parallel reviewers; the security coordinator received an independent static boundary review.

Traced normal generation, setup, paid-request persistence, cancellation, restart/recovery, immutable candidates, trimming, selections, relocation/export, agent queue/winners, and runner implementation/review/commit. The implementation uses existing Node/Python platform features and a small dependency set; no rewrite or abstraction task is justified merely by file length. The observed performance issue is tied to repeated synchronous audio reads rather than a speculative scalability target.

## Evidence

- `reproduce.mjs` uses only synthetic audio and isolated roots under `.runtime/feedback-code-*`, then removes them. It copies unchanged compiled setup into a controlled root and redirects a copied retention entrypoint's imports to the reviewed code while keeping retention output isolated.
- Setup gate returned success with an unusable existing signal interpreter. This reproduces the existence/readiness mismatch without modifying the real environment or installing dependencies.
- A one-second source with a half-second cut, retained via its source path, returned source bytes but preserved metadata requiring different cut bytes.
- A 100-candidate, five-second source-only library reads 88,204,400 source bytes per list. Three synchronous list timings were 233, 221 and 217 ms on this machine. These are fixture measurements, not a historical performance trend.
- `reproduce-runner.py` creates a temporary Git repository and simulates a crash after the implementation's completed checkbox but before review. The actual runner exits 0 (“All tasks complete”) without review, preserving active state and dirty unreviewed changes.
- The actual shared cut validator rejected a 40–50 second cut with HTTP-style status 400 because both schema maxima remain 30, despite supported 60-second recordings.
- `reproduce-backend.mjs` ran the unchanged compiled backend in an isolated fake runtime: startup sent SIGTERM to a fresh synthetic model child while its session claim remained alive, then returned successfully. No user model/process was touched. The silence-only runner restart finding is source-established; no 30-minute operation was manufactured.

## Limits

No paid generation, model download, real listening acceptance, fresh dependency installation, publishing, or third-party binary audit was performed. Synthetic fixtures prove the identified behavior, not real model sound quality. Full baseline execution and explicit omissions are in `../test-review/test-audit.md`; security scope/limits are in `../security-review/report.md`.

## Recovery state

Only review documents/diagnostics and owned ignored fixtures were created. Code diagnostic roots and temporary Git repos were removed by their finally/context cleanup. No application code or existing tests were edited, and no commits or external publication were made. The UX report records its own browser fixture lifecycle. All finding tasks remain open.
