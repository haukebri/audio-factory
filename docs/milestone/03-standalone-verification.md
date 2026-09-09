# Milestone 3 — Standalone verification

Status: planned. Depends on [milestone 2](02-portable-workflow.md).

## Outcome

Evidence demonstrates that extraction preserved the working lifecycle, audio export and failure handling on a supported machine, including first-use setup.

## Work and required checks

1. Port the existing factory service/QA fixtures and signal assertions. Keep relevant authentication, strict input, busy handling, idempotency/conflict, disconnect, interrupted work, process ownership, offline QA/cut, source/derivative lineage and lifecycle checks. Separate game provenance/import/loop tests from the standalone suite without pulling game modules into it.
2. Run the standalone build and focused fixture suite with FFmpeg and signal packages. Fixtures must not download generation or CLAP models. Document the limited Linux fixture setup separately from Apple Silicon generation support.
3. Validate first-use setup in an isolated checkout with no factory `.runtime/`, no installed project dependencies and an isolated model cache. Exercise pinned runtime/environment preparation and real downloads. Do not delete existing source environments or caches to simulate this. A cached smoke alone does not establish clean installation.
4. Run two complete real generation/QA/export jobs on Apple Silicon, using the source smoke script as the starting point. Retain the first bundle before the second job. Confirm the second session clears the first temporary output but preserves retained audio, environments and caches.
5. Verify requested raw duration, stereo 44.1 kHz PCM16, non-silent audio, default normalized cut and complete matching source/processing lineage. Verify the CLI and owned processes are stopped after each job, including the covered failure paths.
6. Exercise signal-only operation and explicit missing-CLAP reporting. Verify offline analysis/cut does not launch a persistent service. Preserve loopback authentication and Origin rejection in the standalone API.
7. Listen to the real smoke results when an audio-input tool or listener is available. Record who/what listened, prompt, seed, source hash, observations and remaining limitations. Never substitute signal validity for semantic quality; absent listening leaves that dimension provisional.

## Preflight, waiting and safe recovery

Verify Apple Silicon/Metal, Node/pnpm, uv, Git, FFmpeg, disk space for separate caches/environments, network/model access, and port availability. The source setup's 3 GiB floor is a check, not a promise of total installation footprint; measure and document actual requirements. If access requires credentials or terms acceptance, report the specific prerequisite without exposing credentials or claiming access was verified.

Record created checkouts, environments, downloads and retained outputs immediately in the verification log. Reuse verified files on retry. Follow live process status, health and setup logs through the existing realistic deadlines (20-minute manual startup wait, 10-minute configured generation timeout). A quiet download or a polling timeout is not proof the operation stopped. Confirm termination before restarting; do not create overlapping inference jobs. On a busy port, stop only a verified owned session or report the conflict. Preserve mismatched artifacts and failure evidence for explicit repair.

## Acceptance evidence

- [x] Build, service/QA fixtures and signal assertions pass without Urban Wildlife dependencies.
- [ ] Clean setup completes with recorded tool versions, source revision, lockfiles and verified model hashes.
- [ ] Two real jobs return valid export bundles; retention, next-session cleanup and cache reuse behave as documented.
- [ ] Normal jobs and tested failure paths leave no owned factory/model process running.
- [x] Signal-only, unavailable CLAP, offline operations and authenticated manual API behave as documented.
- [ ] Evidence distinguishes fresh standalone results from inherited source evidence and optional listening/performance observations.

Record actual commands and evidence locations here when run. Additional acoustic classes, seed sweeps and timing benchmarks are best-effort; no new universal quality claim is needed to finish this milestone. Missing mandatory hardware/download evidence leaves the relevant item open rather than converting a fixture pass into a real smoke pass.

## Runner tasks

Execute in the global order in [the task queue](../tasks/m01/00-overview.md); task status is authoritative for execution.

- [03 — Port service and recovery checks](../tasks/m01/03-service-regressions.md)
- [04 — Verify offline QA and portable exports](../tasks/m01/04-portable-export-checks.md)
- [07 — Verify first-use setup in an isolated checkout](../tasks/m01/07-fresh-installation.md)
- [08 — Verify two real jobs and session cleanup](../tasks/m01/08-real-job-smoke.md)

Tasks 03–04 establish the checked fixture/API items: [portable export evidence](../tasks/m01/04-portable-export-checks.md). Fresh setup, real jobs and their process cleanup remain open.
