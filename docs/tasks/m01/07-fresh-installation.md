# 07 — Verify first-use setup in an isolated checkout

Status: [x] Complete

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [03](../../milestone/03-standalone-verification.md)
Depends on: [06 — Document the standalone agent and manual workflows](06-agent-workflow.md).
Expected duration: 30–90 minutes including downloads.

## Outcome

Establish that a new supported-machine user can install the pinned runtime and weights without the source project's environments or caches.

## Work and scope

Preflight Apple Silicon/macOS/Metal, Node/pnpm, Git, uv, FFmpeg, network/model access, free storage in both checkout and cache locations, and service-port ownership. Record versions and required storage observations. Use a disposable copy of the task input tree without node_modules, dist, `.runtime/` or `out/`, and an isolated Hugging Face cache; do not erase existing caches to simulate first use.

Run the documented root launcher/bootstrap and explicit setup/setup-qa paths to install MLX and CLAP environments and fetch verified weights. Record commands, input revision/file hashes, setup logs, runtime revision, installed lock agreement, downloaded artifact hashes and cold-cache evidence in this task. Keep the verified checkout/cache for task 08 and record their paths and state. Correct only evidenced setup/extraction failures and rerun affected checks.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- First-use package/environment/runtime/model setup completes from the recorded empty initial state. A reused cache is not described as a fresh download.
- Both MLX and CLAP artifact hashes and pinned dependency/runtime checks pass; no Urban Wildlife runtime path is consulted.
- Repeating setup/readiness checks reuses valid artifacts. Any deliberate mismatch check uses an isolated fixture, preserves the mismatched file and never corrupts real weights.
- Record setup elapsed time and disk use, exact retained verification paths and any incomplete operation. No factory/model process remains active after setup. Real audio generation follows in task 08.

## Preflight and recovery

Installing pinned project dependencies and downloading the configured models are within this task; do not invoke system package managers, accept new terms on the owner's behalf, substitute models or silently replace mismatches. Missing mandatory access/hardware is a blocked result with completed work preserved.

Follow progress logs and confirmed live process handles, allowing the documented startup budget and a realistic download budget within this task's expected duration. Recheck a timed-out observation before retrying. On restart, resume the same recorded checkout/cache and verified downloads; do not repeat cold installation merely to recreate evidence. Record external filesystem mutations immediately. No mandatory listening or owner pause.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Completed machine verification on 2026-09-09 against clean input HEAD `beadf782274fe06d2fc94df824d1380bcebe426c`. Read the complete task, overview, specification, milestone, task 06 evidence, README/usage and launcher → setup/download → backend/readiness → QA/service/ownership flow. No repository or ancestor AGENTS.md exists on disk; supplied working agreements apply. No implementation failure was evidenced, so only this task, its overview row and the supported milestone acceptance item changed. No commit.

### Mandatory preflight and cold state

Apple M4 MacBook Pro, 32 GB, Darwin arm64/macOS 26.6.2 (25G83), Metal 4; Node 22.22.3, pnpm 9.15.9, Git 2.49.0, uv 0.10.11, FFmpeg 9.0.1, bootstrap Python 3.14.4. Checked with `uname -sm`, `sw_vers`, `system_profiler SPHardwareDataType SPDisplaysDataType`, tool version commands, `df -h` and `lsof -nP -iTCP:8766 -sTCP:LISTEN`. Port had no listener. Checkout and cache are on the same volume, initially 735,114,366,976 bytes free (about 685 GiB), comfortably above the setup's 3 GiB floor. That floor is not a total-footprint estimate.

Retained base **`/Users/haukebrinkmann/Library/Caches/audio-factory-m01-07`**; checkout **`/Users/haukebrinkmann/Library/Caches/audio-factory-m01-07/checkout`**. Created the base and copied `git ls-files -z` files with `shutil.copy2`, preserving executable modes. Asserted no `node_modules/`, `dist/`, `.runtime/` or `out/`; created and asserted empty `hf/`, `uv-cache/`, `uv-python/` and `pnpm-store/`. No source environments, operational state or caches were copied or erased. The copy has no repository `.git`; input identity is its revision plus full file manifest. `initial-state.json` records creation at 12:17:31 UTC and `input-sha256.json` records every copied file (manifest SHA-256 `bcf365ed001bec118e0fc910daaa983d7c1f3433c82168a402ec9a2065fd5bd5`). Independent verification confirms every copied input file remains unchanged.

Source `../environment.sh` from this checkout for **every** subsequent command, including task 08. It selects `HF_HOME=<base>/hf`, both HF hub-cache variables `<base>/hf/hub`, `XDG_CACHE_HOME=<base>/xdg`, `UV_CACHE_DIR=<base>/uv-cache`, `UV_PYTHON_INSTALL_DIR=<base>/uv-python`, and `npm_config_store_dir=<base>/pnpm-store`, and unsets `PYTHONPATH`/`VIRTUAL_ENV`. uv reused the existing global CPython 3.11.15 at `/Users/haukebrinkmann/.local/bin/python3.11` (resolved home `/Users/haukebrinkmann/.local/share/uv/python/cpython-3.11-macos-aarch64-none/bin`); no fresh interpreter download is claimed. Both project environments were created empty, with system site packages disabled. No Urban Wildlife runtime path was consulted: setup/backend code uses only checkout-relative paths, all weights resolve into isolated `hf/`, and interpreter paths are global rather than source-project environments.

Python `urllib.request` HEAD preflight returned HTTP 200 for GitHub runtime repository, npm Ajv registry, PyPI MLX index and all three configured MLX weight URLs plus pinned CLAP `pytorch_model.bin` (`logs/network.json`). Actual subsequent package/model downloads passed. No credentials supplied, terms accepted, system package manager invoked or model substituted.

### Commands and results

All commands below ran from the retained checkout after sourcing `../environment.sh`. Logs are under `<base>/logs/`; timed commands used `/usr/bin/time -p` and redirected stdout/stderr to the named log.

| Command | Result | Wall time | Log |
| --- | --- | --- | --- |
| `./run setup` | Exit 0; root bootstrap installed frozen Node dependencies (0 reused, 9 downloaded), built, cloned pinned MLX source, synced 21 packages and downloaded/verified three weights | 69.49 s | `setup-cold.log` |
| `./run setup-qa` | Exit 0; created QA environment, synced 28 packages and downloaded/verified eight CLAP files | 35.01 s | `setup-qa-cold.log` |
| `node --input-type=module -e 'import { MlxBackend } from "./dist/backend.js"; const backend = new MlxBackend(); await backend.start(); await backend.stop(); console.log("MLX readiness passed; Metal available");'` | Exit 0; actual Metal availability, clean pinned runtime, dependency lock and model hashes pass | 2.73 s | `mlx-readiness.log` |
| `python3 ../verify.py verified-cold.json` | Pass; exact freeze/lock equality and Python 3.11.15 for both environments, clean runtime, all artifact hashes/sizes/cache paths, all input file hashes | — | `verified-cold.json` |
| `./run setup` | Exit 0; audited 21 installed packages and reused valid weights | 2.68 s | `setup-repeat.log` |
| `./run setup-qa` | Exit 0; audited 28 installed packages and reused valid CLAP files | 1.71 s | `setup-qa-repeat.log` |
| `python3 ../verify.py verified-repeat.json` | Pass; full result equals cold verification, including all artifact paths, hashes, bytes, mtimes and inodes | — | `verified-repeat.json` |
| `HF_HUB_OFFLINE=1 .runtime/qa-venv/bin/python -c 'from qa import Clap; model = Clap(); print("CLAP pinned local model/processor load passed on CPU")'` | Exit 0; actual pinned processor/model loaded locally on CPU, including CLAP's dependency/hash checks | 18.34 s | `clap-readiness.log` |
| `node --input-type=module -e 'import { ensureSetup } from "./dist/setup.js"; import { MlxBackend } from "./dist/backend.js"; await ensureSetup(true); const backend = new MlxBackend(); await backend.start(); await backend.stop(); console.log("Repeated automatic setup and MLX readiness passed");'` | Exit 0; automatic readiness reused installation without invoking setup; repeated backend checks pass | 1.95 s | `readiness-repeat.log` |
| `./run status` | Exit 0; `{"status":"stopped"}` | — | `status.log` |

Cold explicit setup totaled **104.50 seconds**; all tracked setup processes exited 0. No short observation timeout caused a retry. Repeated setup is cache reuse, not fresh download evidence. No deliberate mismatch was injected; real weights were never modified for testing. The retained `verify.py` is a runnable independent check, not a repository test-suite addition.

### Pins and downloaded artifacts

Runtime HEAD `779434a908193105335fd8d833418603625b2859`, no tracked runtime modifications. MLX model revision `da6edc54ddba10bfd79a077102ded687f80e882b`; CLAP revision `8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`. Both installed environments exactly match their complete locks, with no extra packages. Node frozen-lock bootstrap passed. Relevant input SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `run` | `8b738f4f17c3c5b3f3e122a5a98fa79c2e612ede295550568a78b8bef31adbb0` |
| `package.json` | `645ca3165f803892cc886123acb8955f45629894fcbcd34b2ea89392c8c850cc` |
| `pnpm-lock.yaml` | `12a4164a82fff196d3802096274a083e78f141a61153d1334f054ce7ba1e439e` |
| `setup.mjs` | `544cfc3a4066dd1b82ab27f2be5c9b1cf036c0b2074038bf0e9022fbc29da322` |
| `download_models.py` | `d7736e2f95642082e682156b9c2b914466ef59afc3caab6dd369371dc11ab32f` |
| `qa-setup.py` | `22eaacf285b1a9edc7d0930dd10fdacdb944406f8aaa2bb9101190ebb8c5ec61` |
| `config.json` | `bac3498052b35e101ff582ad21a06f5bb12bb8f2bff995b4785f005dbfb0d1dc` |
| `qa-config.json` | `2fb909fa8929b9ad23c1a6937439e388bbceb17461357fd64c271b94b91e7545` |
| `requirements.lock` | `e38396e526d5e27cc5d4bd36d5802f876d82042b5a1a6ad3c77e74d24395cb3a` |
| `qa-requirements.lock` | `1dc953bf9b14a297325dd307ef7e75401a80e8723bc51bfe958bc1a63498a42f` |
| `qa-model.lock.json` | `a28643e40969ac223ed36a197c4590c9f3d3e073c7e30aab40415b282170b7eb` |
| `src/setup.ts` | `c4c9078edc98c3fb80fae87ad3b9efea83c821f36011f94d86a82a55b25f0eaa` |
| `src/backend.ts` | `97796af9dacb98a61dfb2b928b1b629f6c39347140a5f4e932591b5c370a46e2` |

All downloaded bytes were independently hashed and size-checked against configured pins:

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| `dit_sm-sfx_f16.npz` | 919193814 | `7e702d2640699a57fe436ca975fda16832040ba568c1e092c2ae826987558118` |
| `same_s_decoder_f32.npz` | 218090820 | `909928a8e6937c1ebe6ac4b729f0462bd3773704a11ea18278e42671dc69bfe4` |
| `t5gemma_f16.npz` | 567443068 | `8deb20489f36d9aec539f26c9c67321f99bc5fe300d470435ed6e76be4f16bbd` |
| `config.json` | 5390 | `9efb9557bc804f2ca6e394486af2e45dfed0b18554909735a99c6220b84e4288` |
| `merges.txt` | 456356 | `fe36cab26d4f4421ed725e10a2e9ddb7f799449c603a96e7f29b5a3c82a95862` |
| `preprocessor_config.json` | 541 | `9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753` |
| `pytorch_model.bin` | 614525833 | `1cd3c601bc4afe0fa87be3de4c13dd2cfadd249fac1e29acf74a9b296c3219bb` |
| `special_tokens_map.json` | 280 | `06e405a36dfe4b9604f484f6a1e619af1a7f7d09e34a8555eb0b77b66318067f` |
| `tokenizer.json` | 2108746 | `77ef92283d67f0d97e1454909a964afcbfa2019f0fb9f18f8e88d5c25c3ba729` |
| `tokenizer_config.json` | 384 | `377f91458f7729a4574a84c77bdce67dbc3c58c1a345a29bbf8c4eb1307948a3` |
| `vocab.json` | 798293 | `ed19656ea1707df69134c4af35c8ceda2cc9860bf2c3495026153a133670ab5e` |

### Cleanup, storage and recovery

`logs/cleanup-storage.json` records final process/port/filesystem assertions. No factory, setup, downloader, runtime Git, uv, FFmpeg or model process remains; `ps -axo pid=,ppid=,comm=,args=` inspection found none matching the verification paths or factory/model commands, and `lsof` confirmed port 8766 free. No HTTP service or audio generation was started. `out/` and `backend-owner.json` are absent; no HF `*.incomplete` remains. The setup-created private token is retained at mode 0600 and was never printed.

`du -sk` measured 4,292,272 KiB (about **4.09 GiB**) for the complete retained base: checkout 1,054,196 KiB, HF cache 2,268,612 KiB, uv cache 933,064 KiB, pnpm store 36,328 KiB, managed-interpreter directory empty. Environment/package-cache hardlinks mean separately summed sizes can double-count storage; the combined base measurement accounts for shared inodes. Final volume free space was 731,664,613,376 bytes. These are setup observations, not a generation peak-space guarantee.

External mutations were recorded during execution: isolated base/input copy/caches, Node packages/build, runtime checkout, new MLX/QA environments, verified downloaded artifacts, QA manifest, private token and logs/check script. All remain under the recorded base for task 08. Existing source-project environments/caches and this repository's runtime were untouched. Nothing is incomplete or awaiting repair. Resume using the same checkout and environment file; setup is idempotent and verified weights must be reused. No cache cleanup or new cold copy is needed.

Inherited evidence: tasks 03–06 cover unchanged service/recovery, fixture and portable workflows; source backend/listening rationale remains inherited and grants no acceptance to future generated audio. This task establishes fresh standalone installation only. No browser check is specified (there is no browser UI), and no real-audio smoke, scoring inference, listening or full regression-suite rerun was performed; real jobs belong to task 08. No mandatory task-07 check is missing. Owner acceptance is not required.

Final repository check: `git diff --check` passed; only task 07 evidence/status, its overview row and the proven clean-setup milestone item changed. No staging or commit.
