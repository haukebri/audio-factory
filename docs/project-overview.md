# Audio Factory project overview

## Purpose and delivery approach

Extract the working Urban Wildlife audio factory into a standalone tool that other developers can use with their own projects. Copy the proven implementation, remove its workspace and game dependencies, and verify the same workflow in isolation. This is a packaging and integration project, not a new inference engine.

The standalone tool is implemented and milestones 1–3 have recorded acceptance evidence: isolated build/bootstrap, portable fixtures/examples/skill, fresh pinned setup and two real MLX/CLAP jobs with retention and process cleanup. The [README](../readme.md) describes that verified workflow. See [task 07 setup evidence](tasks/m01/07-fresh-installation.md#evidence) and [task 08 smoke evidence](tasks/m01/08-real-job-smoke.md#evidence) for exact inputs, versions, hashes and limitations. No standalone listening acceptance is claimed. Third-party notices and the prospective distribution inventory are verified in tasks 10–11. The owner confirmed license availability and directed closure in task 12; all four milestones and release readiness are marked complete on that basis. Nothing has been published.

## Source of truth

Inspected on 2026-09-09:

| Source | Role |
| --- | --- |
| `/Users/haukebrinkmann/Projects/urban-wildlife/assets-src/audio-factory/` | Working implementation, current `README.md`, `QA.md`, schemas, locks, and tests |
| `/Users/haukebrinkmann/Projects/urban-wildlife/.agents/skills/audio-factory/SKILL.md` | Current agent workflow and quality/recovery guidance |
| `/Users/haukebrinkmann/Projects/urban-wildlife/docs/slices/audio-factory.md` | Original delivery plan and historical evidence |
| `/Users/haukebrinkmann/Projects/urban-wildlife/docs/slices/audio-factory-experiments.md` | Listening comparisons and switch from C++ to MLX |
| `/Users/haukebrinkmann/Projects/urban-wildlife/docs/slices/audio-factory-audit.md` | Rejected pilot and distinction between technical validity and sound quality |

The source repository HEAD was `00d64d6cbf71bf0f9d35832784d7a9aa3ffe35aa`. The inspected factory worktree also had staged/working changes in `ambient-acceptance-browser.mjs`, `ambient-acceptance.mjs`, and `cue-audition.mjs`. HEAD alone therefore does not identify every inspected file. Record copied-file hashes and the source revision at extraction time; do not reset or modify the source project.

Current implementation and its README supersede historical descriptions of resident C++ inference, six-second padding, permanent run archives, and the old generate command with a user-supplied idempotency key. `QA.md` records later lifecycle and normalization changes as well as limitations. Keep this history as rationale, not as competing setup instructions.

## Behavior to preserve

- **One temporary job:** `make` (also available as `generate`) prepares missing components, generates, analyzes, exports, and shuts down even on failure. Each model operation uses a subprocess that exits afterward.
- **Historical extraction backend:** official Stable Audio 3 MLX, Small-SFX F16 DiT, F32 SAME-S decoder, and F16 T5Gemma. Extraction preserved source revision `779434a908193105335fd8d833418603625b2859`, model revision `da6edc54ddba10bfd79a077102ded687f80e882b`, artifact hashes, Python/dependency locks, eight steps and zero extra duration padding. Do not upgrade or revive C++ during extraction.
- **Verified current backend (2026-09-09):** [M2 task 08](tasks/m02/08-medium-gguf-generation.md) replaces generation with Stable Audio 3 Medium GGUF F16, including `stable-audio-3-medium-same-l-v1.0-F16.gguf` and its required companion artifacts/runtime. The pinned sa3.cpp/Metal runtime uses Medium DiT/SAME-L F16, conditioner/T5Gemma F32 and vocabulary; real studio, export, relocation and lifecycle checks passed. This supersedes the extraction-era MLX/C++ restriction. Human listening quality remains unestablished.
- **Request:** prompt required, 1–2000 characters; duration 0.5–30 seconds, default 3; optional seed 0–2147483647. Preserve strict schema validation.
- **Analysis:** signal analysis finds active regions and rhythmic bass; optional CPU CLAP ranks supplied descriptions. Default `make` QA requests CLAP using the first 200 prompt characters and noise alternatives. `{"clap": false}` avoids CLAP setup. Missing CLAP remains an explicit advisory failure with available signal evidence preserved.
- **Export:** preserve original stereo 44.1 kHz PCM16 audio. Backend processing attenuates by 3 dB; prepared cuts use region 1, short fades and peak normalization to -3 dBFS by default. Explicit start/end bounds, normalization off, and peak targets from -30 to -3 remain available. No active region is an explicit failure.
- **Provenance:** portable companions contain original audio, generation settings and hashes, processing bounds/gain, QA evidence, license references, and provisional review status. Validate the bundle when relocating it. Do not claim cross-backend byte reproducibility.
- **Offline review:** `inspect`, `analyze`, `cut`, and `retain` work with saved output; mutating offline operations require the HTTP session to be stopped. Review sequentially before opening a new session.
- **Manual service:** loopback `127.0.0.1:8766`, bearer token, Origin rejection, bounded input, single active generation/QA operation and 429 contention responses. Preserve session-scoped idempotency, conflict handling, accepted-work draining and owned-process recovery. Manual sessions stop after 30 seconds idle.

For the completed first release, the normal entry point is a CLI and an agent skill. The existing HTTP API is retained for advanced use; a desktop app, web UI, hosted API, engine plugin system, alternative model backends, batch scheduler, and Windows/Linux generation support are outside the first release. The owner has now authorized a second phase for a local review UI, human feedback and automatic quality control; its [M2 milestone](milestone/05-review-and-quality.md) and [task queue](tasks/m02/00-overview.md) define that extension. Other first-release exclusions remain unchanged.

## Storage contract

| Location | Lifetime |
| --- | --- |
| `out/` | Temporary runs, intermediate audio, analyses and exports; cleared only after successful setup and acquisition of the service port on the next session |
| `.runtime/` | Reusable environments, runtime checkout, private token and operational logs; ignored by Git |
| `.runtime/retained/` | Explicitly preserved portable candidates; survive subsequent sessions |
| Hugging Face cache | Verified CLAP and historical MLX downloads; Medium GGUF files are under `.runtime/sa3-gguf/models/` |
| A consuming project's directory | User-owned durable copy of the complete export bundle |

Never clear unrelated directories, retained exports or caches during session initialization. Failed or interrupted evidence remains subject to this temporary-session lifetime; explicitly retain needed comparisons before the next generation. Do not copy the source project's tokens, PID files, environments, caches, historical runs or audio corpus into the new repository.

## Extraction boundary

Use the factory directory's contents as the new repository's tool root, preserving its internal layout (`src/`, schemas, Python tools, `.mjs` helpers and lockfiles). Leave the existing task-runner `scripts/` intact.

| Component | Extraction treatment |
| --- | --- |
| `src/`, schemas, config, setup/download scripts, QA, bundle/lineage validation and retention | Copy and adapt only repository-relative assumptions |
| `run`, TypeScript config and root audio package scripts | Make root-local; use a standalone package manifest and frozen lockfile |
| Ajv imports through `packages/content-schema/node_modules` | Declare Ajv directly and resolve it as a normal dependency |
| Model/dependency pins and schema identifiers such as `urban:audio-factory-export@1` | Preserve initially; branding alone does not justify a format migration |
| `.agents/skills/audio-factory/SKILL.md` | Adapt to standalone paths and portable delivery; retain quality and recovery guidance |
| `import.mjs` and its CLI branch | Leave game recipe mutation in Urban Wildlife; deliver verified bundles through existing `retain` instead |
| `prepare-audio-loop.mjs` | Leave with the game initially: it enforces game-specific mono 48 kHz output and an exact FFmpeg version; normalized factory cuts remain included |
| Game browser/ambient checks, cue/footstep/static audition scripts and five-sample pilot assets | Leave with the game; they validate its catalogs/playback rather than standalone generation |
| Factory tests, fixtures and smoke checks | Carry relevant coverage; remove reliance on sibling asset packs and game validators |
| QA experiment/audition helpers | Carry only if needed for a documented standalone check; do not make historical experiments a runtime dependency |

No game catalog, attack-feedback recipe, generated type pipeline, gameplay gain, or stable game asset ID belongs to the core tool. Consumers may convert a delivered bundle through their own asset pipeline. A new universal importer or adapter framework is unnecessary for the first release.

## Quality and operational evidence

The source experiments support choosing MLX over the rejected C++ path. Later listening found all twelve five-second holdout clips contained useful sounds, but regions sometimes contained multiple events. Valid purrs triggered rhythmic warnings. A later flesh candidate contained owner-rejected static despite favorable CLAP and signal results. Consequently, neither numerical QA nor region selection grants acceptance; listen where possible and explicitly state when listening is unavailable.

Classify milestone evidence as follows:

- **Mandatory:** standalone build and focused behavior checks; isolation from Urban Wildlife; real supported-machine smoke; output/retention/shutdown verification; accurate installation and distribution contents.
- **Inherited:** source listening reports, selected backend rationale, pinned artifacts and prior game integration evidence. Reuse while the underlying settings/bytes remain unchanged; inherited passes do not prove standalone execution.
- **Best-effort:** additional seed/class listening and performance characterization beyond the documented smoke. Missing additional coverage must not turn into an unbounded retry loop or block unrelated work.

Preflight tools, architecture, free space, download access and port/session ownership before long-running work. Initial setup may take minutes; the Medium startup wait permits 90 minutes (60 download / 30 build) and configured Medium generation deadline is 3 minutes. Wait on process/readiness evidence and progress logs, not a short silence timer. Never signal an unrelated process to free the port. Hash or dependency mismatches are explicit repair cases, not permission to silently replace artifacts. Record setup/download changes and verification state as they occur; resume from verified caches instead of repeating completed downloads. Stop on missing authority, unavailable required access, or a proven failure with no safe recovery.

## Milestones and completion

The [build task queue](tasks/m01/00-overview.md) breaks these milestones into numbered, independently reviewed changes for `scripts/run_codex_tasks.py`. It preserves the scope below and brings focused checks forward to verify incremental work.

| Order | Milestone | Outcome |
| --- | --- | --- |
| 1 | [Standalone core](milestone/01-standalone-core.md) | A self-contained checkout builds without the game workspace |
| 2 | [Portable workflow](milestone/02-portable-workflow.md) | Users and agents generate, review and preserve usable bundles |
| 3 | [Standalone verification](milestone/03-standalone-verification.md) | Fresh setup and real jobs establish the extracted workflow |
| 4 | [Distribution readiness](milestone/04-distribution-readiness.md) | Documented, licensed source distribution ready to share |

The standalone project is ready when a supported-machine user can follow the README from a clean checkout, generate and inspect an export, retain its complete lineage across a second job, and finish with no factory or model process left running. The checkout must have no runtime dependency on Urban Wildlife, no private operational state or bundled weights, and a clear software license plus verified third-party notices. Public publishing is a separate action; preparing release materials does not itself publish anything.
