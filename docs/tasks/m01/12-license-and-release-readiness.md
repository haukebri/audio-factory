# 12 — Apply the authorized license and close release readiness

Status: [ ] Blocked — owner software-license authorization required

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

Prepared 2026-09-09 against clean input/final implementation revision `4950da3204d7cda86e7275e5e2f9765776eefe81`. Read the complete task, overview, specification, all four milestones, tasks 01–11 evidence, extraction inventory, notices and README. Inspected the license provenance path: `config.json` → `src/service.ts` run metadata → `bundle.mjs` companion → `retain.mjs` validation/copy. No executable contents changed. No repository/ancestor AGENTS.md exists on disk; supplied working agreements apply.

### Missing mandatory authority

No owner software-license choice is present in the supplied instructions or repository evidence. Rechecked LICENSE/LICENCE/COPYING/NOTICE files at source factory/skill ancestors and destination ancestors, both package manifests, and source tracked license filenames; no applicable grant was found. Task 10's copied-source/header audit is inherited. Dependency/runtime licenses in THIRD_PARTY_NOTICES do not authorize licensing the project code.

**Required owner input:** identify the software license (and copyright attribution, if required) and explicitly authorize applying it to the copied Urban Wildlife factory code and standalone additions, including the pre-existing scripts. Until then, LICENSE creation, matching it to authority and including it in the final distribution cannot pass. Status and overview row remain unchecked; milestone 4's source-license item and project readiness remain incomplete. This is a missing license decision, not a post-completion acceptance pause.

### Independent preparation and inherited checks

Created only ignored `.test-artifacts/m01-12/` evidence files and the documentation edits recorded below. A Python preflight using `git ls-files -z` and SHA-256 verified **all 69 input files exactly match task 11's final `candidate-sha256.json`**, with no symlinks. `preflight.json` records the revision, searched authority locations and result; `input-sha256.json` preserves the matching input manifest. Therefore task 11's complete explicit 69-file inventory remains the candidate list, with current documentation bytes substituted. LICENSE is still absent; the authorized final list will be those same 69 paths plus LICENSE (70 files), subject to rechecking on resumption. No new packaging system or placeholder license was added.

The unchanged explicit list includes THIRD_PARTY_NOTICES, skill, examples, source/config/schemas/locks/docs and excludes all private/generated/game artifacts identified by task 11. README now states the concrete license blocker and completed notices/inventory; project and milestone summaries agree. README and unchanged notices separate project software, downloaded runtime/models and generated-output rights. No new legal interpretation, terms acceptance or commercial-use clearance is claimed. Task 10's same-day authoritative terms research is inherited unchanged.

Task 11's frozen install/build, seven Node/two Python passes, four corrected-provenance export variants, command/skill/example paths and clean-copy checks are inherited, not rerun. Its hash-bound task 07 cold setup and task 08 two real MLX/CLAP jobs, retention/relocation, offline/manual lifecycle and shutdown evidence remain valid. No implementation, config, pin, lock, example JSON or executable README command changed. Independently checked all 14 task 11 fixture paths remain absent and its copy has no node_modules, dist, .runtime, __pycache__ or out. No process was started by task 12 and no cleanup mutation is needed.

### Every milestone acceptance item reviewed

Items are numbered in the order of each milestone's acceptance list; links point to the queue's actual evidence, not task counts.

| Milestone | Acceptance items and direct evidence | Result |
| --- | --- | --- |
| 1 | 1 install/build, 2 isolated imports, 3 no game dependency, 5 copied pins and 6 exclusions: [task 01](01-standalone-core.md#evidence), refreshed by [task 11](11-distribution-audit.md#evidence). Item 4 root launcher: [task 02](02-launcher-and-setup.md#evidence), also exercised in task 11. | All six supported. |
| 2 | 1 schema examples: [task 05](05-request-examples.md#evidence); 2 complete fixture lineage, 3 retention/relocation, 4 cut/normalization/source preservation: [task 04](04-portable-export-checks.md#evidence), with real bundles in [task 08](08-real-job-smoke.md#evidence); 5 help/docs agreement and 6 standalone skill paths: [task 06](06-agent-workflow.md#evidence), refreshed by [task 09](09-verified-user-docs.md#evidence) and task 11. | All six supported. |
| 3 | 1 build/service/QA: [tasks 03](03-service-regressions.md#evidence) and [04](04-portable-export-checks.md#evidence), rerun in task 11; 2 fresh setup/pins: [task 07](07-fresh-installation.md#evidence); 3 two jobs/cache/retention and 4 normal process cleanup: [task 08](08-real-job-smoke.md#evidence), failure cleanup in task 03; 5 signal/missing CLAP/offline/auth: tasks 03–04 and 08; 6 evidence classifications: tasks 07–08. | All six supported; listening remains explicitly provisional. |
| 4 | 1 README/skill paths, 3 source exclusions and 4 clean checkout/input binding: [task 11](11-distribution-audit.md#evidence); 5 limitations: [task 09](09-verified-user-docs.md#evidence); 6 prior milestone outcomes: the rows above. Item 2 notices: [task 10](10-third-party-notices.md#evidence); project LICENSE still missing. | Five supported; item 2 remains unchecked. |

No listening limitation is counted as a pass or added as an owner gate. No fresh installation, build, fixture suite, model download, real smoke, manual service or listening ran in task 12: unchanged evidence is reused as explicitly required. Browser checks are inapplicable because there is no browser UI. License-dependent mandatory checks remain unrun/blocked, so no final source-distribution readiness or publication is claimed.

### Review and recovery

Final checks: `node .test-artifacts/m01-11/links.mjs` checks local documentation paths/anchors; `git diff --check` checks whitespace. Final results and SHA-256 for every current changed file are recorded in `.test-artifacts/m01-12/final-checks.json` and `changed-sha256.json`; the latter is external to the hashed documents to avoid a self-referential hash. The final inventory/hashes are in `candidate-sha256.json`. These ignored artifacts supplement this durable evidence and the input revision; they are not distribution contents.

No staging, commit, runner edit, source-project mutation, environment/cache/output change, upload, push or visibility change occurred. No external mutation or unfinished operation needs recovery. On resumption, record explicit license authority, apply its exact terms/attribution, update README/notices and the 70-file inventory, verify affected documentation/hashes, then close readiness/status only after mandatory checks pass. Rerunning the read-only preparation is safe; do not repeat real jobs merely to review inherited evidence.
