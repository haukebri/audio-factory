# 09 — Finish the verified installation and usage guide

Status: [x] Complete

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

Completed 2026-09-09 against clean input HEAD `7981f04b3fcc1ee7bb878585d8fac96be75fd16e`. Read this task, queue, project specification, all milestone files, tasks 04–08 evidence, README/usage/examples/skill and the launcher → CLI/setup/download/backend → service/ownership → QA/Python/FFmpeg → bundle/retain/smoke flow. No repository or ancestor AGENTS.md exists on disk; the supplied working agreements apply.

Implementation is documentation only: replaced stale pending-setup/smoke claims in README, usage, examples and skill; added tested versions, measured setup/network/storage observations, root command sequence, local/offline distinction, retention/destination verification, logs/repair and current smoke command. Linux instructions explicitly cover fixtures only and do not claim a Linux run. Added the missing frozen Node install before the fixture build (already demonstrated by tasks 01/07). Corrected project and milestone 1–2 status summaries from actual evidence; milestone 3's already-supported acceptance items remain unchanged. Only milestone 4's proven limitations and prior-milestone evidence items are checked; release-checkout, inventory and licensing gates remain open. No runtime, pins, examples JSON, tests or runner changed.

### Mandatory documentation verification

- `node .test-artifacts/m01-09-links.mjs > .test-artifacts/m01-09-links.log` passed: all 154 local Markdown links (final pass after evidence links were added) in root README, docs, examples and skill resolve, including anchors. Reused only task 06's link-checking code; no fixture/inference work was repeated.
- A Python SHA-256 comparison against `/Users/haukebrinkmann/Library/Caches/audio-factory-m01-07/task08-input-sha256.json` passed for **all 45 non-Markdown inputs**, covering runtime, setup, launcher/package scripts, locks/config/schema files, examples and checks. Manifest SHA-256: `3fc2c09e98c45cd9e4f80b3b92477466ce560251bfb1e048da707b0208926a0b`. Per-file results are in `.test-artifacts/m01-09-inputs.json`. Confirmed retained setup/smoke/suite/review/cleanup logs exist and parsed completed offline/manual review and successful cleanup assertions. Command semantics and tested bytes are unchanged, so task 07–08 evidence remains applicable to this revision.
- Followed the README sequence against recorded output: `./run setup` and `./run setup-qa` → task 07 `logs/setup-cold.log` / `setup-qa-cold.log`, exit 0; `./run make examples/request.json` → task 08 smoke's two calls to the same `dist/cli.js make` branch with that exact JSON, valid completed results; `./run status`, illustrative `inspect <run-id>` and `retain <audio-path>` → task 08 `logs/task08-review.json` and smoke retention results. Root launcher/build equivalence is established by tasks 02/07 and unchanged `run`/package/CLI hashes. The README explicitly labels returned IDs/paths as templates rather than literal commands.
- README fixture commands map to task 04's exact minimal `uv venv`/`uv pip sync` recipe and successful build/suite output; frozen pnpm installation maps to tasks 01/07. `pnpm audio:smoke` maps to task 08 `logs/task08-smoke.log`, exit 0. Status/stop/repair commands mentioned inline map to tasks 07–08's explicit setup and manual lifecycle checks. No executable README command lacks output evidence or a labeled variable-path template.
- Executed the **exact Node verifier snippet extracted from `docs/usage.md`** with `node --input-type=module - <relocated-audio-path>` on both existing real bundles in `<base>/task08-other-project/<run-id>/`. Both printed `Bundle verified`; paths/results are in `.test-artifacts/m01-09-bundles.json`. No retention/copy was repeated. The Python health-client snippet remains clearly labeled illustrative and not live-tested; authenticated API behavior is established by unchanged service checks.
- Manually compared documented CLI arguments, request/QA/cut limits, endpoint methods/routes, authentication/Origin rejection, status codes, idempotency/429 handling, deadlines, setup repair, offline mutations, cut bounds/normalization, retention and temporary lifetime with the actual implementations. No runtime discrepancy was found. Platform limits, three-generation default, multi-event regions, provisional listening/advisory QA and separate model/output rights are explicit. No required game dependency or unsupported release claim remains.
- `git diff --check` passed. Scope inspection confirms only this task's documentation/evidence, overview row and supported milestone documentation changed; no staging or commit.

### Inherited evidence, unrun checks and recovery

`<base>` is `/Users/haukebrinkmann/Library/Caches/audio-factory-m01-07`. [Task 07](07-fresh-installation.md#evidence) supplies fresh setup, exact versions/pins/model hashes, 104.50-second cold setup, 4.09 GiB storage and repeat cache reuse. [Task 08](08-real-job-smoke.md#evidence) supplies two actual five-second jobs, valid PCM/normalized cuts, retention/relocation, offline signal/cut operations, manual stop/drain/idle, build and seven Node/two Python passes, unchanged caches and final process/port/fixture cleanup (`logs/task08-cleanup.json`). Tasks 04–06 establish the fixture recipe, schema examples, manual API and skill/portable workflow. Prior source listening rationale remains inherited and cannot accept these candidates.

No build, suite, setup, model download, real smoke, manual service or cleanup mutation was redundantly rerun: unchanged bytes/semantics and recorded cleanup are reused as required by this task. No browser check is specified or applicable (no browser UI). No Linux execution, live Python health-client check, new listening, acoustic sweep or performance benchmark ran; these are illustrative or best-effort, not missing mandatory checks. Both real candidates remain provisional. All mandatory task-09 checks are complete; owner acceptance is not required.

Mutations/recovery: edited only the listed tracked documentation and wrote ignored `.test-artifacts/m01-09-*` link/input/bundle verification artifacts. A temporary editing helper was removed after use. No service/model process, environment, token, cache, output or external application was created/changed by these checks. Retained task 07–08 evidence is untouched; no unfinished recovery or disruptive retry is pending. Rerunning these read-only document/bundle checks is safe. Do not rerun setup or smoke to recreate inherited evidence.
