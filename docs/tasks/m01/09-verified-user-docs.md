# 09 — Finish the verified installation and usage guide

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [04](../../milestone/04-distribution-readiness.md)
Depends on: [08 — Verify two real jobs and session cleanup](08-real-job-smoke.md).
Expected duration: 15–25 minutes.

## Outcome

Replace planning-only usage with instructions demonstrated by the standalone checks, while keeping release/license status honest.

## Work and scope

Update root `readme.md`, `docs/usage.md`, examples and skill as needed using tasks 07–08 evidence. Include tested prerequisites/versions, initial network/setup time and storage observations, root commands, output retention/delivery, logs/status/repair, fixture-only Linux instructions and known limitations.

Explain offline local generation versus first-use downloads, advisory QA, region/event limitations and separate model/output rights. Link the build task queue and milestone evidence. Report the tool as implemented only where evidence supports it; distribution licensing remains pending until task 12. Update the project overview and milestone 1–3 acceptance items from actual task evidence, not task-count arithmetic.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- Follow the README's command sequence against the recorded clean-checkout/smoke evidence; every executable command has supporting output or a clearly identified illustrative placeholder.
- Reuse setup/smoke evidence while source, locks and command semantics are unchanged; rerun only an affected command if these edits expose a discrepancy.
- All local links and example paths resolve; documented CLI/HTTP behavior agrees with implementation.
- Platform support, temporary lifetime, three-generation default and provisional listening/QA limits are explicit. No game dependency or unsupported release claim remains.

## Preflight and recovery

This is a documentation task; do not repeat model downloads or inference without changed inputs or missing evidence. Any newly discovered runtime failure must be recorded and fixed narrowly with its affected check before asserting the guide works.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
