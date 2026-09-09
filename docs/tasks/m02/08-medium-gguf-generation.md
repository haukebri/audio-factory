# 08 — Migrate generation to Stable Audio 3 Medium GGUF F16

Status: [ ] Planned

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [07 — Verify the studio and quality loop end to end](07-integrated-verification.md).
Expected duration: 90–180 minutes plus bounded downloads/build.

## Outcome and scope

Owner selection (2026-09-09): replace the default generation backend with [thepatch/stable-audio-3-medium-GGUF](https://huggingface.co/thepatch/stable-audio-3-medium-GGUF), using the explicitly requested `stable-audio-3-medium-same-l-v1.0-F16.gguf`. This authorizes the required local GGUF runtime migration and supersedes earlier instructions to preserve the MLX Small-SFX backend or avoid C++ for this task. Tasks 04–07 retain their existing generation scope; their unchanged QA, storage and UI evidence remains reusable.

The requested file is the SAME-L autoencoder, not a complete generator. The repository's model card requires the matching `stable-audio-3-medium-dit-1.5B-v1.0-F16.gguf`, `stable-audio-3-medium-conditioner-v1.0-F32.gguf`, and shared encoder/tokenizer artifacts linked from that card. Use the full compatible Medium F16 set: do not substitute a quantized DiT/decoder or treat the SAME-L file alone as the model. Inspect current primary runtime and artifact documentation before selecting exact revisions, filenames, hashes and download sizes. The model card identifies `sa3.cpp` as the runtime; its published performance claims are not on-machine acceptance evidence.

Trace the existing setup, generation subprocess, request settings, cancellation, export and provenance paths. Reuse their contracts and replace only the backend-specific pieces needed for GGUF inference; no general backend plugin framework is required. Build and pin a compatible local runtime with Apple Silicon Metal support. Preflight actual Medium settings and supported prompt/duration/seed controls rather than carrying Small-SFX's step count blindly. Make the verified Medium F16 backend the default for CLI/agent and studio generation. Keep LAION Larger CLAP General QA unchanged and run generation and QA sequentially.

Update setup/readiness, runtime/model manifests, generation configuration validation, portable provenance, user/agent instructions and third-party inventory to describe the actual backend and all companion artifacts. Record backend revision, model files/hashes, encoding, seed and effective settings for each new candidate. Preserve old MLX candidates and their original metadata; mixed historical/new bundles must remain readable. Do not claim cross-backend byte reproducibility or improved acoustic quality without evidence.

## Required checks and review demo

- Verify the runtime build, complete model set and hashes, repeatable setup/cache reuse, and explicit readiness failures for missing or mismatched components. Record actual disk use, peak memory, latency and owned-process exit on this 32 GiB Apple Silicon machine.
- Run affected build and behavioral regression checks for changed backend contracts, settings, provenance, failure and cancellation paths. Reuse unchanged task 07 evidence; rerun checks whose underlying runtime behavior changed.
- Run at most three real new generations in a dedicated verification store, including one studio prompt → Medium F16 generation → Larger CLAP General QA → playback → retained export journey. Verify source/delivered hashes, complete portable bundles after relocation, history after restart and CLI/studio agreement. Use controlled fixtures for retry outcomes the real sample does not produce.
- Verify cancellation and timeout reap owned model processes, and restart cannot duplicate uncertain generation. Preserve existing candidates before any output cleanup.
- Confirm default selection uses the exact SAME-L F16 and matching DiT F16 artifacts. No silent MLX or quantized fallback counts as successful migration. Record quality separately; missing human labels must not block verified engineering delivery.

## Preflight and recovery

Before downloads/build, verify public artifact access, compiler/CMake/Metal and runtime prerequisites, memory, exact required disk plus build/cache reserve, and browser/session capabilities. Inspect artifact terms and reuse the owner's recorded license authorization where applicable; do not introduce a routine approval gate for this explicitly selected model. Record genuinely new unavailable authority if encountered.

Allow up to 60 minutes for initial downloads and 30 minutes for the first build with condition-based progress/deadlines. Default validation request budget is 20 minutes after setup with at most three generations; determine and record a realistic per-generation deadline from the runtime preflight. Normal model loading/build silence alone is not failure. Compatible local build/dependency repairs, resumable verified downloads and reuse of successful preflight outputs are authorized within these budgets. CPU execution may diagnose Metal failures, but measure and disclose the actual production backend before claiming readiness.

Stage setup in an isolated owned runtime directory and keep the last working generation configuration recoverable until the new backend passes real inference and integration checks. On failure, restore the previous working default, preserve new diagnostic evidence/cache and leave this task incomplete with the exact remaining blocker. Do not relabel rollback as migration success. Record every download, runtime/configuration change and generated candidate immediately, including whether rerunning could repeat work. Never delete historical retained audio, silently launch another generation on restart, substitute another model or use cloud inference.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement this migration and its required integration checks, update this status/overview and directly supported milestone items. The runner owns review and commits; do not change the runner or commit from the implementation session. No publication is requested.

## Evidence

Planning only. The model card was inspected on 2026-09-09 to establish the multi-file F16 dependency and runtime requirement. Exact artifact/runtime pins, compatibility, resource use and real generation remain unverified; record them during implementation.
