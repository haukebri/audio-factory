# M2 — Review studio and automatic quality control tasks

This queue implements the [new M2 milestone](../../milestone/05-review-and-quality.md). The completed [m01 queue](../m01/00-overview.md) covered the original four milestones. These seven tasks are planned, not executed. Owner scope now includes a local frontend, human feedback and automatic audio rejection/regeneration; first-release exclusions of those features no longer apply.

## Ordered queue

| Task | Done | Result | Requires |
| --- | --- | --- | --- |
| 01 | [ ] | [Persist candidates and human feedback](01-durable-review-store.md) | M1 |
| 02 | [ ] | [Expose the local studio and shared job workflow](02-studio-service.md) | 01 |
| 03 | [ ] | [Build the prompt and listening workspace](03-review-frontend.md) | 02 |
| 04 | [ ] | [Connect and preflight a local audio-language judge](04-audio-judge.md) | 03 |
| 05 | [ ] | [Reject and regenerate within a durable budget](05-automatic-quality-loop.md) | 04 |
| 06 | [ ] | [Use human feedback for repeatable quality evaluation](06-feedback-evaluation.md) | 05 |
| 07 | [ ] | [Verify the studio and quality loop end to end](07-integrated-verification.md) | 06 |

Task files are authoritative. The existing runner skips `00-` files and reads `Status: [ ]` / `Status: [x]`. Keep task numbers unique and execute in order. Preview:

```sh
python3 scripts/run_codex_tasks.py docs/tasks/m02 --dry-run
```

Execute when starting implementation:

```sh
python3 scripts/run_codex_tasks.py docs/tasks/m02
```

The runner checkpoints all dirty files with `git add -A`, including pre-existing work. Inspect status/ignored private data and establish an intentional baseline before launch. The working tree at planning includes the authorized M1 QA retry/bundle/idle/documentation fixes; preserve them. This plan does not launch the runner, commit, download models or publish anything.

## Shared execution agreement

Read the full task, milestone, project overview, applicable AGENTS.md and relevant callers before editing. Reuse existing validators, atomic writes, subprocess ownership, generation/QA/cut and bundle verification. Keep the existing CLI and portable bundles compatible. No framework migration, hosted database, telemetry, public deployment or training pipeline by default.

Local processing is the planning default. No cloud upload or paid provider is authorized. Task 04 performs the concrete judge capability preflight in a separate environment; exact pins are selected from verified evidence, not a guessed model name. Missing optional credentials or human label counts must not stop tasks that do not need them. Do not silently substitute CLAP for an audio-language judge. The model task cannot complete without a real audio-input invocation; an incompatible candidate requires a concrete revised local plan, not a fabricated pass.

Before each task, check its actual tools/access/disk/session needs. Human intervention is only for new consequential risk or a required unavailable authority/capability with no safe continuation. Use condition-based waits and task budgets; quiet model loading alone is not a failure. No routine owner acceptance gate: return `owner_acceptance_required: false` for completed engineering tasks. Human feedback collection is part of the product, not a runner pause.

Use fresh owned fixture roots and ephemeral ports. Record every job, candidate, download and state mutation immediately. Preserve candidates before `out/` can be cleared. Repeated submission/reconnect must attach to existing work. On restart, recover a verified completed artifact or record interrupted/uncertain state; do not automatically launch a duplicate generation. Terminate only owned processes, preserve evidence on failure and leave no model process running after checks.

## Evidence and completion

- Mandatory: the current task's concrete behavior and checks; model integration requires real audio consumption, browser integration requires an actual browser journey, persistence requires restart/relocation checks.
- Inherited: unchanged M1 setup/model pins, signal/backend behavior and prior checks tied to hashes. Reuse while relevant state is unchanged. M1 evidence does not prove the new judge or studio.
- Best-effort: wider acoustic coverage and extra performance sampling beyond task budgets. Lack of real human labels limits quality claims; it does not invalidate completed tooling.

Record commands/results, input revision and affected hashes, real versus synthetic samples, actual listening provenance, output paths, cleanup and unresolved recovery. Large private artifacts stay ignored; durable Markdown summarizes evidence. Add only focused behavioral regressions, and run affected checks after changes. Tests must preserve existing audio and may not label model scores or playback events as human approval.

After mandatory checks pass, mark the task and this row complete, and update only milestone items directly supported. The runner then reviews/commits. Preserve owner-authorized scope in review. Product readiness and measured quality improvement are separate: task 06 may finish with `quality_not_established` when human data are insufficient, and task 07 may close product integration while the milestone's quality targets remain unchecked. Do not claim dramatic improvement until the frozen held-out evaluation supports it.
