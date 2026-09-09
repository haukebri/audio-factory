# Audio Factory build tasks

This is the executable breakdown of the [project overview](../../project-overview.md) and its four milestones. All tasks are planned. Run the queue sequentially; each numbered file is one independently reviewed commit with a concrete demo/check. Independence means reviewable changes, not parallel execution or absence of prerequisites.

## Runner format and commands

The existing runner reads immediate children matching `<number>-<name>.md`, sorts by numeric prefix, requires a `#` title and `Status: [ ]` or `Status: [x]`, and skips files starting with `00-`. Task-file status is authoritative; this table mirrors it. The runner does not enforce dependency metadata, so keep this queue in numeric order and verify prerequisites before each task. A pending status note containing “blocked” stops the runner before starting that task; remove that note only after the blocker is resolved.

From the repository root, preview without starting agents or changing Git:

```sh
python3 scripts/run_codex_tasks.py docs/tasks/m01 --dry-run
```

To execute the queue when ready:

```sh
python3 scripts/run_codex_tasks.py docs/tasks/m01
```

The real run starts Codex implementation and critical review/fix sessions, then commits each approved task. It also checkpoints **all** existing dirty files with `git add -A`, including unrelated untracked files. Before launching, inspect `git status --short`, ensure local/private files are ignored, and establish an intentional baseline. This repository had no commits when the queue was authored; its first real run would create a recovery checkpoint from the dirty tree. No baseline commit or implementation run is performed by creating these task documents.

Preflight Python 3, Git, a usable Git author identity, and an authenticated Codex CLI (`CODEX_BIN` optionally selects it). The runner invokes Codex with approvals/sandbox bypassed; launch it only in the intended checkout. Its existing recovery logs/state live under `.git/codex-task-runner/`. Rerun the same command after interruption to resume; do not delete recovery state or mark a partial task done. No runner changes are required for this queue.

## Ordered queue

| Task | Done | Reviewable result | Milestone | Requires |
| --- | --- | --- | --- | --- |
| 01 | [x] | [Extract a buildable standalone core](01-standalone-core.md) | 01 | — |
| 02 | [x] | [Wire the root launcher and setup paths](02-launcher-and-setup.md) | 01 | 01 |
| 03 | [x] | [Port service and recovery checks](03-service-regressions.md) | 03 | 02 |
| 04 | [x] | [Verify offline QA and portable exports](04-portable-export-checks.md) | 02 | 03 |
| 05 | [x] | [Add validated request and cut examples](05-request-examples.md) | 02 | 04 |
| 06 | [x] | [Document the standalone agent and manual workflows](06-agent-workflow.md) | 02 | 05 |
| 07 | [x] | [Verify first-use setup in an isolated checkout](07-fresh-installation.md) | 03 | 06 |
| 08 | [x] | [Verify two real jobs and session cleanup](08-real-job-smoke.md) | 03 | 07 |
| 09 | [x] | [Finish the verified installation and usage guide](09-verified-user-docs.md) | 04 | 08 |
| 10 | [x] | [Prepare the source and third-party notice inventory](10-third-party-notices.md) | 04 | 09 |
| 11 | [ ] | [Verify the prospective source distribution](11-distribution-audit.md) | 04 | 10 |
| 12 | [ ] | [Apply the authorized license and close release readiness](12-license-and-release-readiness.md) | 04 | 11 |

Service checks from milestone 3 are deliberately brought forward before portable workflow work. This gives each incremental change useful verification; it does not change the milestone requirements. Task 04 supports both milestone 2's portable delivery and milestone 3's QA coverage. The final user guide follows real setup/smoke evidence so it describes a demonstrated workflow.

## Shared execution agreement

Read this overview, the active task, its milestone and the project overview completely. Read relevant source files before copying or adapting them. The original source is `/Users/haukebrinkmann/Projects/urban-wildlife/assets-src/audio-factory/`, with its skill at `/Users/haukebrinkmann/Projects/urban-wildlife/.agents/skills/audio-factory/SKILL.md`. Current source README/QA and implementation take precedence over superseded experiments. Record changes from the documented source baseline; never reset the source project.

Preserve the current MLX backend/pins, strict API/authentication boundaries, temporary output lifecycle, advisory QA and portable lineage. Use the existing implementation, libraries and fixtures. Leave game integration and historical audio behind. No new backend, UI, importer framework, task scheduler or publication work is included.

Every task preflights its actual prerequisites before expensive work. Tasks 01–06 need no generation/CLAP model downloads. Task 07 owns isolated fresh setup; task 08 reuses it. Record every external mutation immediately (created checkout/environment, downloaded files, retained output), what remains unverified, and whether retrying could repeat it. Use verified caches and idempotent operations; do not kill unrelated processes, discard output before retention, or replace mismatched artifacts silently. Follow live process/readiness conditions through realistic deadlines, checking the same process after a transient observation failure. Do not treat ordinary setup silence as a failure or start a duplicate job.

## Evidence, review and completion

- **Mandatory:** each task's required checks and observable result. Missing hardware/access or a failed mandatory check means incomplete/blocked, even if other checks pass. Do not interpret “all checks available” as permission to skip a mandatory unavailable check.
- **Inherited:** unchanged source pins/listening rationale and earlier queue evidence, bound to source revision/file hashes and exact behavior. Reuse it when underlying state is unchanged; source passes alone cannot establish standalone execution.
- **Best-effort:** additional listening, broader acoustic/seed coverage and performance investigation beyond the required smoke. Record limitations without adding an unbounded retry or approval loop.

Record concise evidence in the task's Evidence section, including exact commands/results, input identity, artifact paths and recovery state. Keep large logs/audio/private state ignored; durable docs contain summaries and hashes, not tokens. Each reviewer checks this task's complete required demo and any task-owned recovery changes. Run only checks appropriate to changed behavior and required milestone gates.

After the task's implementation and all mandatory checks are complete, change its Status to `[x]` and this overview row to `[x]`, then let the runner review and commit. Update milestone checkboxes only when evidence proves the whole item; do not mark a milestone complete because one task passed. If a required check or external input is missing, leave the task unchecked and report the exact blocker. Tasks do not require routine owner acceptance; `owner_acceptance_required` is false for completed tasks.

The only anticipated unresolved owner decision is the software license at task 12, if no applicable license/owner choice has appeared by then. Complete notices, distribution preparation and technical verification first. Do not invent approval pauses for provisional listening, redundant checks or safe local recovery. Publishing is outside this queue.
