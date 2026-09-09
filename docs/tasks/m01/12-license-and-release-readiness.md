# 12 — Apply the authorized license and close release readiness

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [04](../../milestone/04-distribution-readiness.md)
Depends on: [11 — Verify the prospective source distribution](11-distribution-audit.md).
Expected duration: 10–25 minutes once license authority is available.

## Outcome

Finish the reviewed source distribution with an owner-authorized software license and evidence-backed milestone status.

## Work and scope

Read the notices and task 11 inventory, then locate the owner's explicit software-license choice or an applicable existing source license authorizing the copied code. Apply only that authorized choice as `LICENSE`, preserving required copyrights/notices. If no choice/authority exists, finish all independent file/evidence preparation and return blocked with the concrete missing decision; do not silently select a license or mark release readiness complete.

Update README license information and include LICENSE in the final inventory. Review every milestone acceptance item against the linked task evidence. Record the final implementation revision plus hashes for current uncommitted task changes, since the runner creates the final commit after review. Mark milestone/project readiness complete only when all required items are proven; public publishing remains a separate action.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- LICENSE matches recorded owner authority or applicable source terms, and THIRD_PARTY_NOTICES plus README consistently separate tool, model and generated-output rights.
- The final distribution file list includes LICENSE and required notices and still excludes private/generated/game artifacts.
- Every milestone checkbox has direct evidence from this queue; missing mandatory checks remain incomplete. No best-effort listening limitation is disguised as a pass or made an extra owner gate.
- Reuse task 11 checks for license/docs-only changes; rerun relevant checks if executable contents changed. The final result states source-distribution readiness without claiming publication.

## Preflight and recovery

This task is the only anticipated consequential owner decision: licensing, and only if not already authorized. Return `owner_acceptance_required: false` when done; if authority is missing return blocked and leave Status unchecked. The runner's pause-after-completion flag is not a substitute for obtaining missing license authority. No push, upload or public visibility change is authorized by this queue.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
