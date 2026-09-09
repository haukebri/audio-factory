# 08 — Migrate generation to Stable Audio 3 Medium GGUF F16

Status: [x] Complete — Medium GGUF F16 integration verified; quality_not_established (2026-09-09)

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

Implemented 2026-09-09 from clean input revision `66203af0db36e4229b8c12cd004c15360c0fd53e`. Read the task, queue, milestone specification, project overview, supplied working agreements, prior integration/license evidence and setup/backend/service/CLI/workflow/signal/QA/store/export paths. No repository or ancestor AGENTS.md exists on disk. No runner changes, staging, commits or publication.

### Implementation and pins

`GgufBackend` replaces the generation default in both CLI and shared studio/agent workflow. It uses explicit component paths, ignores SA3/GGML environment overrides and `.env`, and rejects inference that does not report an Apple `MTL` backend. Existing request bounds, sequential generation/QA, PCM16/−3 dB source processing, cuts and portable bundles remain. Cancellation prevents a later export subprocess and does not restart a canceled backend; owned children are awaited through exit. Signal analysis uses the same five pinned packages in `.runtime/signal-venv`, independent of the preserved historical MLX environment. Larger CLAP General, its locks, policy and scoring implementation are unchanged.

Primary sources inspected: [Medium card](https://huggingface.co/thepatch/stable-audio-3-medium-GGUF), [shared text artifacts](https://huggingface.co/thepatch/t5gemma-b-b-ul2-GGUF), and the pinned runtime's `README.md`, `docs/METAL.md`, CLI/pipeline, model resolution, environment and loudness implementation. Current auto-resolution prefers a different autoencoder precision; explicit paths enforce the owner's exact F16 pair. Selected the F32 text encoder reference described by the Medium card; the shared card also offers an F16 default, which is not used here.

- sa3.cpp: `07db5c7980c8c6cc945c4f9d35959b3114246d95`; GGML fork: `fff93d2714e934822100586ce241267e8cc821af`.
- Medium model revision: `380a7b25ba6b3b12563b01193227580a9ae7dac0`; shared text revision: `26caadf5cb1b6523370caff61f6a32337f46625e`.
- Exact filenames, byte sizes, URLs and SHA-256 values for all five files are in [config.json](../../../config.json) and [the inventory](../../../THIRD_PARTY_NOTICES.md#current-medium-gguf-runtime-and-artifacts). These include `stable-audio-3-medium-same-l-v1.0-F16.gguf`, matching DiT F16, conditioner F32, encoder F32 and vocabulary.
- Explicit effective controls: eight steps (independently confirmed in the current Medium CLI and real logs), CFG 1, zero duration padding, LogSNR `(2000,-6.2,0,2)`, monolithic SAME-L, flash attention off, runtime peak normalization/limiter off. New candidate metadata records these controls, encodings, runtime/GGML revisions, all model hashes and resolved seed. Historical run metadata is not rewritten.
- Build: CMake **4.1.0**, Release, `SA3_METAL=ON`, `BUILD_SHARED_LIBS=OFF`; static GGML and Apple system frameworks confirmed with `otool -L`. `build-manifest.json` records source pins/build flags and executable hashes: generator `a3bf4f2dfb105851dd074e03579f4ba2f643fc9e58c91f3a790a4d5a1766c299`, smoke `e6091078fa187abfb112dd4f1c383f8247e65dc8a6e312886c310becbb4ad799`.

### Preflight, setup and resources

Private evidence is under **`.runtime/m02-medium/`**: `input-hashes.json`, `baseline/`, `mutations.log`, upstream/API/terms snapshots, build/setup/download logs, readiness fixtures/results, browser evidence, resource samples and retained stores/output. The baseline keeps the prior working configuration/code recoverable. Root `.runtime/sa3-gguf` and `gguf-build-venv` link to the verified owned staging directories; rerunning setup reuses their files. Historical MLX environments, retained audio and QA caches were not removed.

Actual machine: arm64 Apple M4, **34,359,738,368 bytes RAM**; initial free disk **705,750,688 KiB**. Public HEAD requests for all five pinned artifacts returned **200**, without credentials. Exact download requirement **5,754,163,808 bytes**, plus **5 GiB** build/cache reserve, fit before downloading. The pinned model/encoder agreements and notices were inspected; task 12's owner license authorization was reused as directed. No new authority or external session was required.

The active command-line-tools selection lacked `metal`; Xcode **26.2 / 17C52** supplied it through a process-local `DEVELOPER_DIR`, without changing the system selection. Installed CMake in an owned Python 3.11.15 environment. The initial staged build passed; device enumeration found `GPU MTL0 Apple M4`. Its small tensor check is CPU arithmetic, not proof of Metal inference; the real generation logs below establish Metal execution. Initial shader loading took **34.905 seconds**, treated as normal startup.

All five downloads completed and hashes matched within the 60-minute budget. Actual `node setup.mjs` in the dedicated checkout rebuilt/verified the staged runtime and cached models in **105.53 s**; repeat setup took **20.37 s**, with no weight download or source compilation. `readiness-check.py` passed **10 checks**: complete set, each of five missing companions, wrong model hash, wrong binary hash, wrong GGML pin and restored set. The disposable source/model-link fixture was removed. Root `GgufBackend.start()` independently passed after promotion, without generating audio.

Measured allocated storage (`du -sk`): runtime checkout/build/models **5,751,292 KiB**, of which models **5,652,288 KiB**; CMake environment **129,284 KiB**; signal environment **29,512 KiB**. These are directory allocations, not a total-system disk delta or additive cache estimate. The successful studio command's `/usr/bin/time -l` reported **3,898,425,344 bytes maximum RSS**; 50 ms process sampling observed **3,807,056 KiB peak generator RSS** across the three launches. The main Node process's smaller “peak memory footprint” statistic is not presented as model memory. A **180,000 ms** production operation deadline leaves room beyond measured inference and cold shader startup; a successful 30-second acoustic sample was not run.

### Real generations, browser and portability

Exactly **three** real inference processes launched; no more are needed or authorized by this verification budget:

1. Browser job `7c78c4ba7c8b2848842b99cfdfc443dc`, seed `557210219`, 3 seconds: the runtime produced a WAV in **12.84 s**, but the initial integration expected the log label `Metal` instead of actual `MTL0`. The application correctly withheld delivery. Corrected the backend check using the observed log and updated its fixture. Complete raw WAV/run/log evidence remains in `first-failure-output/`; the failed request remains in history. No fallback was accepted and this is not counted as a passing journey.
2. Explicit new browser job **`c0eaba511401e15e752da90c028704da`**, generation **`c511edb3a786fa2dd3951e79b65bfab2`**, seed **30711389**: prompt “A single dry wooden knock, close and clear.”, duration 3 seconds, automatic mode limited to **one attempt / 20 minutes**. Generation/export took **11,263 ms**; the whole workflow **33.864 s**, including **11,759 ms** delivered-audio judging. Larger CLAP General naturally returned **auto_accepted / score_and_margin_pass**. Signal analysis found four regions; the delivered first region is 0.00–0.25 seconds. No inference that the prompt's event count was obeyed, human approval or acoustic improvement follows from that score.
3. A deliberate 30-second request, seed **42**, through the real backend with a **2,500 ms test deadline**, timed out and reaped PID **24306** in **2,601 ms**. Its request/work logs remain in preserved output. It is a lifecycle check, not a completed sound.

Successful candidate **`f6d81b10b6ced9bd4a6699e66ff6462ac84a1c5268986bacf7e49eb980d11172`**:

| Evidence | SHA-256 |
| --- | --- |
| Original/source WAV | `c70468a82bd8838e16848fad61529cb2cf309c67dcc3efd541b5b82f3ad10d5c` |
| Delivered WAV and judge input | `5a270c5d1b19a43208dd14bd06388c628ed6b658c20deb213254e44743ce1590` |

Named session `agent-browser --session m02-medium` drove prompt submission, refresh during execution, take selection, native prepared/original playback, complete TAR download and restart. Both players reached `ended` without media errors. `normal.png` and `restarted.png` were visually inspected: readable controls/evidence, distinct automatic/human states and no horizontal overflow. Failure/reconnect screenshots are also retained. This is technical playback, **not human listening**.

`check.mjs checkout` and `check.mjs relocated` passed source/delivered/judge hash equality, exact generation pins/settings, complete exported bundle validation via `verifyExport`, and history checks. Browser and bearer-agent job response bodies are exactly equal; the browser automation's object transport rounded two floating values, so equality was checked against the original JSON response text. Real CLI `inspect c511edb3a786fa2dd3951e79b65bfab2` exactly matches the candidate's generation record, and CLI `status` reports stopped.

Copied the prior task-07 MLX candidate `c48ecc4467e0f93e5d0435895f426a6525f9a50ae18c14f46a5e4df5b833dc29` into the dedicated store with the same canonical identity and metadata; its original remains untouched. The mixed store validates both backends. Preserved all output, stopped the studio and moved the entire checkout to **`relocated/`**, removing the old checkout path. Restart restored the same two requests and five candidate snapshots, with no replay. Prepared playback and a new `restarted-export.tar` passed after relocation. `medium-export.tar`, both extracted portable bundles, `preserved-output/` and the durable store remain available.

### Automated checks, inherited evidence and cleanup

- `pnpm build`; the full `pnpm test:audio-factory` suite (**24 Node checks and 2 Python checks passed**, zero failures/skips); focused `node --test backend.test.mjs` (**2 passed**): final results recorded in `final-suite.log` and `backend-test-final.log`. New behavioral checks cover explicit F16 selection, literal prompts/seeds, environment isolation, CPU refusal, cancellation between generation/export, SIGTERM→SIGKILL/timeout exit, spawn failure, resumed downloads, complete-cache reuse and preserved corrupt files. Existing suites cover controlled reject→accept/exhaustion, restart without replay, setup cancellation, auth/origin/path boundaries, QA, cuts and portable history. No test cleanup/review project was performed.
- Real cancellation of Metal readiness PID **24182** reaped it and `reset()` did not relaunch it. The third real inference above proves timeout cleanup. Controlled generation cancellation uses the same owned subprocess path, including a stubborn SIGTERM-ignoring executable. `lifecycle.json` records actual identities/exits.
- All eight Larger CLAP manifest files/hashes and its exact installed dependency lock passed. `inherited.json` binds unchanged judge/policy/QA implementation, store, export and UI service files to the input revision. Prior unchanged acoustic/auth/UI evidence is reused; signal execution under its new environment and changed generation behavior were rerun.
- Closed all owned studios and the named browser; stopped the memory monitor. `cleanup.json` confirms both ports closed, root/verification backend owners absent, no model/QA subprocess, original root `out/` still absent and old verification checkout absent. Reopening `openJobs` in another process with an executor that throws on computation recovered the same completed/failed requests without invoking it. Tests remove only their owned fixtures. All historical and new candidate/diagnostic evidence is retained; no recovery remains pending.
- Agent skill validation, all **254** local documentation links/anchors and `git diff --check` passed. `final-hashes.json` records the review inputs outside the hashed documents.

**Not run / not claimed:** `pnpm audio:smoke` would launch two additional real jobs beyond the task's three-launch cap; the bounded real studio journey supplies smoke evidence instead. No further generation, successful 30-second acoustic sweep, CPU parity generation, human listening, real human labels or quality-improvement benchmark was run. Zero human labels remains **quality_not_established**, and does not block this engineering migration. No owner-acceptance gate applies.
