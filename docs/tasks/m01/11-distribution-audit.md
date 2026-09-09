# 11 — Verify the prospective source distribution

Status: [x] Complete

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [04](../../milestone/04-distribution-readiness.md)
Depends on: [10 — Prepare the source and third-party notice inventory](10-third-party-notices.md).
Expected duration: 15–30 minutes.

## Outcome

Prepare and inspect the actual source file set before the final license decision, without publishing it.

## Work and scope

Create a prospective release inventory in this task's evidence using an explicit file list or existing Git facilities. Inspect all proposed files, including hidden directories, to include implementation, config/schemas, locks, examples, skill, notices and docs and exclude private runtime state, weights, generated audio, caches, build products and game content. Mark LICENSE as pending if no authorized license exists yet.

Use a disposable distribution copy to run frozen package installation/build and the focused fixture suite. Check README/skill/example paths in that copy. Reuse task 07–08 real setup/smoke evidence if all relevant files and pins match; compare hashes to prove reuse is valid. Record any required rerun if inputs differ. Avoid adding a packaging framework.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- The recorded candidate inventory contains every file needed for the documented workflow, with no external workspace symlink/dependency and no secret or operational artifact.
- Frozen install, build and focused tests pass in the distribution copy. Required notices and documentation are present; only the explicitly recorded license decision may remain for task 12.
- An input comparison binds real setup/smoke evidence to this candidate, or the affected verification is rerun successfully.
- No package upload, push, repository visibility change or public release occurs. Milestone 4 remains incomplete until licensing and final closure in task 12.

## Preflight and recovery

Use an isolated copy; do not delete private state to make the source tree appear clean. Inspect generated inventory content before committing it so it contains no tokens or private log contents. Reuse valid evidence and clean only task-owned throwaway files. A missing license choice does not prevent this preparatory audit.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Completed 2026-09-09 against clean input HEAD `c69dd5623f1a3e1b8cc06e8e4eaf09e9534f3335`, plus the changes recorded here. Read the complete task, queue, specification, milestone 4, tasks 07–10 evidence, README/usage/examples/skill/notices and launcher → setup/download → backend/service → QA → bundle/retain flow. No repository/ancestor AGENTS.md exists on disk; supplied working agreements apply. No commit or runner change.

### Candidate inventory and inspection (mandatory)

The prospective source distribution is exactly the following **69 files**, selected by `git ls-files -z`, copied with `shutil.copy2` (including executable `run` mode), plus this task's final edits to those same paths. **LICENSE is pending**, absent from this preparatory copy; task 12 must add the owner-authorized license. This is not a publishable release yet.

```text
.agents/skills/audio-factory/SKILL.md
.gitignore
THIRD_PARTY_NOTICES.md
bundle.mjs
config.json
config.schema.json
docs/milestone/01-standalone-core.md
docs/milestone/02-portable-workflow.md
docs/milestone/03-standalone-verification.md
docs/milestone/04-distribution-readiness.md
docs/project-overview.md
docs/source-inventory.md
docs/tasks/m01/00-overview.md
docs/tasks/m01/01-standalone-core.md
docs/tasks/m01/02-launcher-and-setup.md
docs/tasks/m01/03-service-regressions.md
docs/tasks/m01/04-portable-export-checks.md
docs/tasks/m01/05-request-examples.md
docs/tasks/m01/06-agent-workflow.md
docs/tasks/m01/07-fresh-installation.md
docs/tasks/m01/08-real-job-smoke.md
docs/tasks/m01/09-verified-user-docs.md
docs/tasks/m01/10-third-party-notices.md
docs/tasks/m01/11-distribution-audit.md
docs/tasks/m01/12-license-and-release-readiness.md
docs/usage.md
download_models.py
examples/cut.json
examples/qa-clap.json
examples/qa-signal.json
examples/readme.md
examples/request.json
export-lineage.mjs
export.schema.json
package.json
pnpm-lock.yaml
qa-config.json
qa-config.schema.json
qa-model.lock.json
qa-report.schema.json
qa-requirements.lock
qa-setup.py
qa.py
qa.schema.json
qa.test.mjs
qa_test.py
readme.md
request.schema.json
requirements.lock
retain.mjs
review.schema.json
run
run.schema.json
scripts/run_codex_tasks.py
scripts/test_run_codex_tasks.py
service.test.mjs
setup.mjs
smoke.mjs
src/backend.ts
src/cli.ts
src/config.ts
src/ownership.ts
src/qa.ts
src/service.ts
src/setup.ts
src/wav.ts
standalone-core.test.mjs
tsconfig.json
wav-fixture.mjs
```

All 69 file contents were decoded/inspected as UTF-8 text and scanned for private-key/token signatures, operational/binary paths, external workspace paths and local dependency protocols; no source symlink, binary, secret credential or operational artifact was found. Hidden `.agents/` and `.gitignore` are explicitly included. Source-history and evidence paths in docs are informational, not workflow dependencies; the standalone fixture's game-path strings are rejection assertions. Other scan hits were ordinary `file:` property/type text and the lock's `excludeLinksFromLockfile` setting, not local dependency URLs. `scripts/` contains the existing runner and its tests, not runner state; neither was changed or executed.

Excluded by the explicit list: `.git/` (including runner recovery), `.runtime/`, `out/`, `runs/`, `node_modules/`, `dist/`, `.test-artifacts/`, test/browser reports, Python caches, build products, weights, generated audio, game content and experiment archives. No private state was deleted from the working repository. Implementation imports, schemas/configs, all three dependency locks, model lock, fixture helpers, examples, skill, documentation and THIRD_PARTY_NOTICES are present. The existing isolated-core check additionally passed filesystem-restricted imports and absence of external Node symlinks/workspace dependencies. Operator-installed tools/global Python and separately downloaded packages/models are documented prerequisites, not source-workspace dependencies or bundled payloads.

### Narrow correction and affected verification

The audit found task 10's recorded historical GGUF reference still used for new companions. To leave only licensing/final closure for task 12, changed **only `config.json` → `licenses[0].url`** to the exact official MLX agreement already verified in task 10. Updated the notices' historical-reference and remaining-work wording. No agreement text, model, inference setting, lock, implementation, test suite, old run or retained companion changed.

Caller inspection (`rg -n 'licenses|config\.json' src *.mjs *.py`) traced this field through `src/service.ts` into run metadata, then `bundle.mjs` into validated companions. Setup/download/backend do not use `licenses`. Reused task 05's runnable example fixture with one assertion that each exported companion contains the official pinned URL. It failed before the correction with actual GGUF versus expected MLX URL (`provenance-before.log`), then passed all four cuts after it (`provenance-after.log`), including validated lineage, immutable source, signal-only analysis and cleanup. This is the affected provenance rerun; it uses a controlled backend, not new MLX audio. The helper is retained as `provenance-check.mjs` in the evidence directory; copy it to the distribution root to rerun after preparing fixtures.

### Isolated commands and results (mandatory)

Evidence base: **`.test-artifacts/m01-11/`** (ignored). Disposable execution copy: **`.test-artifacts/m01-11/distribution/`**, initially containing only the 69 listed source files, no Git metadata, environments, dependencies, outputs or caches. `preflight.py`, `input-sha256.json` and `inspection-flags.json` record selection, initial hashes and reviewed scan locations without credential contents. Initial manifest SHA-256: `3c22061591def8bc682c78c20d8d605d98ec8d1d2d0d3899ca064349f09b4e0b`.

Preflight: Node 22.22.3, pnpm 9.15.9, uv 0.10.11, FFmpeg 9.0.1, available Python 3.11.15; about 681 GiB free; `lsof -nP -iTCP:8766 -sTCP:LISTEN` found no listener. Cleared inherited `NODE_PATH`, `NODE_OPTIONS`, `PYTHONPATH` and `VIRTUAL_ENV` for the initial execution; `CI=true`. Ran the README recipe from the copy:

| Command | Actual result / evidence log |
| --- | --- |
| `pnpm install --frozen-lockfile` | Exit 0, nine packages installed using cache; lock unchanged (`install.log`) |
| `uv venv --python 3.11.15 .runtime/mlx-venv` | Exit 0, new fixture environment using existing global interpreter (`venv.log`) |
| `uv pip sync --python .runtime/mlx-venv/bin/python <(rg '^(numpy\|soundfile\|cffi\|pycparser\|typing-extensions)==' requirements.lock)` | Exit 0, exactly the five pinned signal packages (`python-install.log`); Bash/Zsh process substitution |
| `pnpm build` | Exit 0 (`build.log`) |
| `pnpm test:audio-factory` | Exit 0, seven Node tests, zero skipped, two Python tests (`tests.log`) |
| `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test:audio-factory` after copying the corrected config/notices | All exit 0; final seven Node tests in 5.457 s and two Python tests in 0.044 s (`install-final.log`, `build-final.log`, `tests-final.log`) |
| `node provenance-check.mjs` | Exit 0 after the correction; all four example JSON validators and four export variants passed (`provenance-after.log`) |
| `node ../links.mjs` | Exit 0; all local Markdown paths/anchors resolve, including README, hidden skill, examples and notices (`links.log`, then `links-final.log` after evidence/status copy) |
| `./run status` | Exit 0, `{"status":"stopped"}` (`status.log`); suite also exercised root launcher bootstrap from another cwd |
| `python3 .test-artifacts/m01-11/compare.py` from repository root | All unchanged inputs and the precise config-only metadata exception verified (`input-comparison-final.json`) |
| `python3 .test-artifacts/m01-11/cleanup.py` from repository root | Exit 0; all recorded fixtures removed, port free, no owned process, clean 69-file source copy (`cleanup.json`) |

Initial provenance-helper and final link-helper invocations used the wrong cwd and exited with module-not-found (`wrong-cwd.log`, `links-wrong-cwd.log`); both passed after correcting cwd (the provenance check first reproduced the intentional failing assertion above). No product failure was masked. Both stray task-owned logs were moved into the evidence base. Final link verification passed all 163 links.

### Binding inherited setup/smoke to this candidate

Before the URL correction, all **45 non-Markdown inputs** exactly matched task 08's manifest. After it, **44 are byte-identical**, including all source, launcher, package/build scripts, schemas, example JSON, model/dependency locks and tests. `input-comparison-final.json` records every digest; SHA-256 of its `unchanged` map serialized with sorted keys and compact JSON separators is `c8ad3818456f9e65a2740bbd046d189a434d81eb727b3a86175505497af1c632`. The original task 08 manifest SHA-256 is `3fc2c09e98c45cd9e4f80b3b92477466ce560251bfb1e048da707b0208926a0b`.

`config.json` before: `bac3498052b35e101ff582ad21a06f5bb12bb8f2bff995b4785f005dbfb0d1dc`; candidate: `f4297004a9715c3d8157d3953c41de51312b55d21dd7262b1e353bb2ff434ea0`. Parsed-object comparison proves replacing only `licenses[0].url` makes the objects equal. Thus runtime/model pins, backend arguments, service settings and QA behavior are unchanged; the new companion reference is covered by the fixture rerun, not falsely attributed to historical smoke.

Reused task 07 cold setup (104.50 s) and task 08's two completed real MLX/CLAP/default-cut jobs, retention/relocation, offline review and manual shutdown evidence under `/Users/haukebrinkmann/Library/Caches/audio-factory-m01-07`. Confirmed the named setup/smoke/suite/review/cleanup logs exist and the smoke JSON still records two verified runs and completed status. README setup/make/inspect/retain/status and manual/repair semantics map to the unchanged code and those exact outputs as traced in task 09; today's copy additionally executes the fixture recipe, validates examples, resolves skill paths and exercises bootstrap/status. Task 10's same-day terms research and agreement copies are inherited unchanged; no new legal interpretation or terms acceptance is made.

No fresh model setup/download, real generation, CLAP inference, manual real-service smoke or listening was repeated: their relevant behavior/inputs are unchanged. Only metadata provenance needed and received a rerun. No browser check is required: there is no browser UI. Additional listening/acoustic coverage remains best-effort and unrun; historical candidates remain provisional. No mandatory check remains unrun.

### Final cleanup, mutations and handoff

Local mutations were recorded as created: ignored source copy/manifests/helpers/logs, Node dependencies/build, five-package fixture environment, temporary fixtures and status token. Tests removed their own runs/retained/copied audio and processes. Independent cleanup checked all 14 recorded fixture paths absent, no owned factory/model/test process, port 8766 free and no `out/`; it then removed only this copy's `node_modules`, `dist`, `.runtime` (including its token), Python cache and temporary helper. The clean source copy and non-secret evidence logs/manifests remain for review. Package caches were reused; no model download or prior environment/cache/output was touched. No unfinished operation or recovery remains. Reinstall fixture dependencies before rerunning tests; do not rerun real smoke merely to inspect evidence.

Final documentation/status edits were copied into that clean source copy, local links rechecked and `candidate-sha256.json` refreshed; every file/mode matches the working candidate. Candidate file list still equals the explicit 69-file inventory. `git diff --check` passed. Only config reference, notices wording, this task/evidence/status, its overview row and supported milestone 4 items changed. Milestone 4 remains incomplete pending task 12's authorized LICENSE and final closure. No upload, push, visibility change, publication, staging or commit occurred. Owner acceptance is not required for this task.
