# Milestone 4 — Distribution readiness

Status: prospective source inventory and clean-copy checks verified; licensing and final closure pending task 12. Depends on [milestone 3](03-standalone-verification.md).

## Outcome

A clean source checkout is ready to give to another developer, with usable instructions, a software license and clear third-party boundaries.

## Work

1. Replace the README's planning status with verified installation, prerequisite versions, first-run expectations, example commands, output lifetime, retention/delivery and troubleshooting instructions. Include the tested supported platform and fixture-only platform distinction.
2. Include the adapted agent skill and examples. Explain setup logs, status, safe repair, model cache location, temporary output cleanup and how to copy a complete retained bundle into another project.
3. Prepare a concise source/third-party notice inventory from the actual copied code, runtime, model and encoder references, CLAP artifact and dependency locks. Verify applicable terms against their authoritative sources at release time; historical source metadata alone is not a complete licensing determination.
4. Establish the owner-selected license for this project's code and include required notices. If the source contains no suitable owner-authorized license, prepare the inventory and release contents first, then obtain the missing license decision. Do not silently choose a license or imply it grants rights to models or generated output.
5. Inspect the prospective release file list. Include source, schemas/configs, dependency locks, examples, skill and documentation. Exclude weights, virtual environments, private tokens, logs, PID files, generated audio, game assets and experiment archives.
6. Follow the final README from a clean distribution checkout. Reuse milestone 3 evidence if the relevant source, locks, setup and instructions are unchanged; rerun only checks affected by subsequent changes. Record the revision and remaining known limitations.

## Acceptance evidence

- [x] README commands and skill paths are usable in the release checkout.
- [ ] Source license and required third-party notices are present, with model/output rights described separately and no unsupported commercial-use claim.
- [x] Release inventory contains no private operational state, weights or game content.
- [x] Clean-checkout evidence covers the final revision and installation instructions.
- [x] Known limitations include supported hardware, temporary outputs, advisory QA and the absence of universal prompt-accuracy guarantees.
- [x] All required checks from milestones 1–3 have recorded outcomes; no planned item is presented as completed.

Public publication, repository visibility changes and package-registry upload are separate external actions. This milestone prepares a reviewable source distribution; it does not require a new installer, hosted service, binary packaging system or automatic updater.

## Runner tasks

Execute in the global order in [the task queue](../tasks/m01/00-overview.md); task status is authoritative for execution.

- [09 — Finish the verified installation and usage guide](../tasks/m01/09-verified-user-docs.md)
- [10 — Prepare the source and third-party notice inventory](../tasks/m01/10-third-party-notices.md)
- [11 — Verify the prospective source distribution](../tasks/m01/11-distribution-audit.md)
- [12 — Apply the authorized license and close release readiness](../tasks/m01/12-license-and-release-readiness.md)

[Task 09](../tasks/m01/09-verified-user-docs.md#evidence) binds the user guide to unchanged setup/smoke inputs and documents limitations. [Task 11](../tasks/m01/11-distribution-audit.md#evidence) verifies the prospective 69-file source copy, command/skill paths, frozen install/build/fixtures, corrected companion terms reference and hash-bound reuse of real setup/smoke. These checks cover the current candidate; task 12 must add the authorized LICENSE and verify final closure. The source-license acceptance item and milestone remain incomplete. Milestones 1–3 link their actual acceptance evidence; no milestone is inferred from task counts.
