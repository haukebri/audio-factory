# 08 — Verify two real jobs and session cleanup

Status: [x] Complete

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [03](../../milestone/03-standalone-verification.md)
Depends on: [07 — Verify first-use setup in an isolated checkout](07-fresh-installation.md).
Expected duration: 20–45 minutes after setup.

## Outcome

Show that the extracted tool completes real generation, QA and portable export and releases its processes across successive sessions.

## Work and scope

Adapt the source `smoke.mjs` to root-local paths and add `audio:smoke`. Use task 07's verified checkout/cache while recording any changed input files. Run two complete real MLX/CLAP/default-cut jobs, retaining the first bundle before starting the second. Preserve both smoke candidates explicitly with their reports.

Verify offline inspect/analyze/cut on the current session, signal-only QA, retained bundle relocation and manual start/status/stop plus idle shutdown. Reuse controlled-backend evidence for disconnect, interrupted work and missing CLAP rather than destroying a real installation. Run the existing standalone build and focused suite once on the smoke-tested code. Listen when a listening tool is available; otherwise record provisional quality without a mandatory owner gate.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- `pnpm audio:smoke` completes two jobs with valid result fields and stereo 44.1 kHz PCM16 raw audio at requested duration, non-silence and verified normalized cuts/lineage.
- The second startup removes the first temporary run; retained bundles, model caches and environments survive. Bundle validation succeeds outside the original output directory.
- Status and owned-process inspection show stopped after each normal job; offline operations leave no server running. Manual sessions drain on stop and exit after configured idle time.
- Signal-only operation works; task 04's missing-CLAP result remains applicable or is rerun if affected. Mandatory build/fixture checks pass on the current code.
- Record run IDs, prompts/seeds, hashes, input revision, commands, retained evidence paths, timing and the actual listening status. Favorable QA must not become an acceptance claim.

## Preflight and recovery

Preflight the still-valid task 07 environment and port ownership, then reuse its verified weights. Retain before a new session; never regenerate merely because a polling observation timed out. Confirm terminal process state before retrying failed work and retain its evidence. Normal inference has the configured 10-minute deadline. Additional seed/class sweeps and benchmarks are best-effort, not additional mandatory jobs.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Completed 2026-09-09 against clean input HEAD `3087707826832f8632e11482c2154384f178d4fc`. Read the complete task, overview, specification, milestone, task 07 installation evidence, task 04 QA evidence, source smoke/QA rationale and launcher → setup/backend → service/ownership → QA/Python/FFmpeg → bundle/retain flow. No repository/ancestor AGENTS.md exists on disk; supplied working agreements apply. No commit.

Implementation: adapted source `smoke.mjs` to `examples/request.json`, added `pnpm audio:smoke` (build then smoke), and reused `inspectWav`/`verifyExport` for raw PCM, measured normalization and lineage checks. The smoke refuses an existing session, records each result and retention immediately, validates both retained bundles, and checks stopped status/owned processes after each job plus removal of the first temporary run. Replaced source memory sampling/cold-warm labels with mandatory assertions and first/second labels; both jobs reuse task 07's installation. No runtime, model, QA, test-suite or runner changes.

### Input, preflight and mutation record

All execution below used **`/Users/haukebrinkmann/Library/Caches/audio-factory-m01-07/checkout`**, after `source ../environment.sh`. Its parent is **`<base>`** below. Task 07's verified Apple Silicon/Metal and tool-version evidence remains applicable. `python3 ../verify.py task08-preflight.json` passed all original input, runtime, environment and artifact checks again; `./run status` returned stopped, `lsof -nP -iTCP:8766 -sTCP:LISTEN` found no listener, and `df -h . ../hf` showed 681 GiB free. Verified local weights require no renewed network access/download; no source-project environment is consulted.

Copied current input into that same checkout, retaining its environments/cache. `<base>/logs/task08-input-changes.json` records old/new hashes: only `package.json`, new `smoke.mjs`, and previously completed task 07/overview/milestone documentation differed from the task 07 copy. `<base>/task08-input-sha256.json` identifies every smoke-tested input file. Final task evidence/status edits are documentation only and were not copied back over that execution snapshot.

| Input | SHA-256 |
| --- | --- |
| Original source `smoke.mjs` | `7f925c1fb5f63a3f5dcd5ff460ea271fff82ea3feff23ff00a3cbf8457ea9715` |
| Standalone `smoke.mjs` | `b012f27f6f038b72eb5c7be4070b6484e55bc5cd3bdb24156aad439f53f15fe0` |
| `package.json` | `8573a542a78b945426fc17e583bd0a90cdcdc2920acc4b0a4f3847b4e8ea8ee7` |
| `examples/request.json` | `0403f774585714e06f6d6551c5fcebc0698c0452a29b8d7db957aab64f978c25` |
| Unchanged `src/service.ts` | `59bb32b772049cac55338d4d1ccf262d5fb9e04ddfe22dcf5641bfa24f241937` |
| Unchanged `src/qa.ts` | `c8a80c5ff1f41d6e894b2370bc79ebd930ca9c76a984b53d884efbfc6de6f38f` |

External mutations: updated isolated input/build; created temporary real runs and reports, three explicitly retained bundles, two destination copies, an offline-output archive, manual service log and local verification scripts/logs. Each smoke result/retention and review copy/session command was recorded incrementally in the evidence files below. Manual sessions subsequently cleared only temporary output, after retention/archive. No existing weights/environments were replaced, source project changed, unrelated process signaled or additional real generation requested.

### Mandatory real smoke

`pnpm audio:smoke > ../logs/task08-smoke.log 2>&1` exited 0, including `pnpm build`. Evidence: checkout **`.runtime/smoke-7cef8095-a47c-49d1-a73a-c1df99836925.json`**. Both requests: **“One dry knock on a wooden door, close microphone, followed by silence”**, **5 seconds**, **seed 111**, default CLAP and default cut. Exactly two real jobs ran; no retries or seed sweep.

| Run ID | Complete make wall time | Generation/export time | Explicit retained directory under checkout |
| --- | --- | --- | --- |
| `a6dc54516713e2050f004fbf65f3cce9` | 8.765 s | 3.018 s | `.runtime/retained/clip-A5fx2V/` |
| `ff4670bcc7ac915e47a33b658e51cb1b` | 5.845 s | 1.433 s | `.runtime/retained/clip-Q3jOxs/` |

Each directory contains `1ac4a30f0de55546e34faffb4213f31a.wav`, its JSON companion (including generation/cut/full CLAP report), and `1ac4a30f0de55546e34faffb4213f31a-source.wav`. Both same-seed jobs produced source SHA-256 **`49143dedad9b234d87bc77184860371de5bd3ca489bd6f50b18e26bf1cd8fd81`** and prepared SHA-256 **`7a73ac275acbe1586412f3f35ef0ae9a5121f7d18fdaef0b65646beb8d39cfec`**. This observation is not a general reproducibility guarantee.

Assertions verified valid result IDs/audio/report, completed generation and CLAP, matching request/settings, three pinned models including F32 decoder, zero padding, raw PCM16 stereo 44,100 Hz and exact five-second duration/non-silence. Raw peak 0.600769, RMS 0.0247984. Both prepared cuts select region 1, samples 15435–42777 (0.35–0.97 s, 0.62 s), with 5 ms fades and measured peak within 0.0001 of −3 dBFS. Metadata records normalization enabled and +39.0766 dB gain from that region's low peak. Source/derivative hashes, bounds, QA references and provisional review validate. Status plus `ps -axo pid=,args=` show no owned factory/model processes after each job. The first was retained before the second startup; the second removed the first temporary run and successfully revalidated its retained bundle.

### Offline, relocation, manual lifecycle and suite

`node ../task08-review.mjs > ../logs/task08-review.log 2>&1` exited 0. Its runnable harness and incremental **`logs/task08-review.json`** record exact CLI arguments/results and copy paths:

- Copied each complete retained bundle to **`<base>/task08-other-project/<run-id>/`** and validated there using `verifyExport`. Both original and prepared bytes plus metadata survive outside `out/` and outside the checkout.
- Current second run: `node dist/cli.js inspect <id>`, `analyze <id> <checkout>/examples/qa-signal.json`, `cut <id> <checkout>/examples/cut.json`, and `retain <audio>` passed. Signal-only CLAP status is disabled. Status/process assertions after offline operations passed; source hash unchanged. Explicit-cut candidate retained at **`.runtime/retained/clip-cAOHbU/57e7de93dd23040514ed7a19f614516a.wav`**. Full current output/reports/work logs archived at **`<base>/task08-offline-output/`** before manual startup.
- `node dist/cli.js start`, `status`, `stop`, `status` returned ready/ready/stopped/stopped. A second `start` followed by condition-based status polling exited automatically with unchanged `idle_ms=30000`; total startup-through-shutdown observation 33.233 s. A 45-second post-start budget was allowed. No service/model remained. Both retained candidates revalidated after these sessions.
- `node ../task08-drain.mjs > ../logs/task08-drain.log 2>&1` exited 0. Actual CLI `stop` against the same authenticated service implementation with a controlled backend stayed pending while accepted work was blocked; releasing it persisted completed run metadata and let stop exit 0. **`logs/task08-drain.json`** retains the result. Its temporary fixture was removed; no third MLX job was needed.

`pnpm test:audio-factory > ../logs/task08-tests-final.log 2>&1` passed **all seven Node tests (zero skipped)** in 5.40 s and **both Python signal tests** in 1.665 s on the smoke-tested code/environment. The suite includes isolated frozen install/build/bootstrap, authentication, Origin rejection, disconnect, interrupted work, drain/idle and owned-process recovery, offline QA/cuts/relocation, explicit missing CLAP with preserved signal evidence, and signal edge cases.

One earlier suite invocation overlapped the manual idle session: its packaging fixture expected a free default port and instead received the live session's bearer-authentication error. Six Node tests passed; packaging failed and Python did not run. Preserved **`logs/task08-tests.log`** documents that orchestration error. After the manual harness completed, CLI status/port checks confirmed shutdown and the complete suite passed as above. No implementation/test was changed to mask it, and no real job was repeated. The mandatory build passed inside `audio:smoke`; the suite also performs its existing isolated build.

### Cache reuse, cleanup, inherited evidence and limits

`python3 ../task08-verify.py task08-verified-final.json` passed full current-input manifest, exact environment freezes/locks, clean pinned runtime and every MLX/CLAP hash. It also compared artifact paths, sizes, mtimes and inodes against task 08 preflight: **all unchanged**. The helper is task 07's verifier with the recorded task 08 input manifest and before/after assertions; both scripts remain at `<base>`.

Final **`logs/task08-cleanup.json`** records stopped CLI, free port 8766, no owned factory/model/test process, empty `out/runs` and `out/work`, no incomplete HF download, and removal of every fixture from both suite runs and the drain probe. Complete retained base disk use: 4,305,152 KiB (about 4.11 GiB). Three retained candidates, two relocated smoke bundles, archive, caches/environments and logs remain deliberately preserved. Nothing is incomplete or awaiting repair. Resume from these artifacts; rerunning smoke would create two new jobs and clear temporary output, while the one-off review harness deliberately refuses existing destination paths. No retry is needed.

Inherited: task 07 installation/Metal/backend pins and source listening rationale remain applicable; tasks 03–04 controlled disconnect/interruption/failure/missing-CLAP evidence remains valid because runtime and fixtures are unchanged. `service.test.mjs` SHA-256 `d821f7edf3523a87aa01bb1b25811f99f38183987ddfa7c97b9fd386269d5b52`; `qa.test.mjs` `2e7d80c0414133eae3bc36d48781aa9fcd32ffdd379638e06fa013c6a1c061d4`. The normal controlled checks passed again here; the historical intentional failure-cleanup probe was not repeated and real CLAP installation was never damaged for a negative test.

Best-effort/listening: tool inventory provides no audio-input/listening tool; **neither agent nor owner listened in this task**. No audio playback is claimed as listening. CLAP completed, ranked the prompt first (0.5385), and rhythmic warning was false, but the raw recording has three detected regions and the first cut received substantial gain. These are advisory observations, not semantic quality or acceptance. Both bundles remain provisional. No acoustic sweep, benchmark or additional listening ran. No browser check is required because the standalone tool has no browser UI. No mandatory check remains unrun; owner acceptance is not required.

Final `git diff --check` passed. Only smoke/package wiring, task 08 evidence/status, its overview row and supported milestone items changed; no staging or commit.
