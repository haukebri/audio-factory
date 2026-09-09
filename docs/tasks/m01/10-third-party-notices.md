# 10 — Prepare the source and third-party notice inventory

Status: [ ] Not started

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [04](../../milestone/04-distribution-readiness.md)
Depends on: [09 — Finish the verified installation and usage guide](09-verified-user-docs.md).
Expected duration: 20–40 minutes.

## Outcome

Prepare reviewable attribution and licensing facts for the exact code, runtime and model artifacts that the tool uses.

## Work and scope

Inspect copied source headers/license files, the locked Node/Python dependencies, the pinned Stable Audio runtime/model/encoder references and CLAP artifacts. Consult authoritative license/terms sources for those exact artifacts, recording revision/date and direct references. Write `THIRD_PARTY_NOTICES.md` with applicable notices and distinctions between distributed code and separately downloaded components.

Record any source-code license authorization already present in owner instructions or authoritative source files, and any missing decision, in this task's evidence. Prepare a concrete short list of unresolved release requirements. Do not choose a project license or infer generated-output/commercial rights from CLAP, owner listening or historical metadata.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- The notice inventory covers the copied/distributed files and separately downloaded runtime/model dependencies, with exact artifact/pin references rather than an unrelated model variant's terms.
- Required available notices are included and authoritative references support the stated terms. Unavailable or unclear mandatory terms are identified explicitly.
- README claims agree with the inventory and do not imply that the future tool license relicenses weights or generated output.
- All machine-verifiable preparation is complete before an unresolved project-license decision is handed to task 12.

## Preflight and recovery

Browsing authoritative terms is required for this task. Do not accept terms, change accounts or publish anything. An absent owner choice alone does not block preparation of this inventory; unavailable mandatory third-party evidence does block claiming this task's inventory complete. Keep the project-license decision at the end of the queue.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Not run. Record commands and outcomes, input revision/hashes, relevant artifact locations, external mutations and recovery state here during implementation. Distinguish mandatory, inherited and best-effort evidence. Leave Status unchecked if a mandatory check is missing or failed.
