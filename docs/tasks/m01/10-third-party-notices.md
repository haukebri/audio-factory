# 10 — Prepare the source and third-party notice inventory

Status: [x] Complete

Overview: [Task queue](00-overview.md) · [Project specification](../../project-overview.md)
Milestone: [04](../../milestone/04-distribution-readiness.md)
Depends on: [09 — Finish the verified installation and usage guide](09-verified-user-docs.md).
Expected duration: 20–40 minutes.

## Outcome

Prepare reviewable attribution and licensing facts for the exact code, runtime and model artifacts that the tool uses.

## Work and scope

Inspect copied source headers/license files, the locked Node/Python dependencies, the pinned Stable Audio runtime/model/encoder references and CLAP artifacts. Consult authoritative license/terms sources for those exact artifacts, recording revision/date and direct references. Write `THIRD_PARTY_NOTICES.md` with applicable notices and distinctions between distributed code and separately downloaded components.

Record any source-code license authorization already present in owner instructions or authoritative source files, and any missing decision, in this task's evidence. Prepare a concrete short list of unresolved release requirements. Do not choose a project license or infer generated-output/commercial rights from CLAP, owner listening or historical metadata.

Only change the implementation/docs needed for this outcome plus this task's evidence/status, its overview row and supported milestone acceptance items. Do not implement later tasks or edit the task runner.

## Required checks and review demo

- The notice inventory covers the copied/distributed files and separately downloaded runtime/model dependencies, with exact artifact/pin references rather than an unrelated model variant's terms.
- Required available notices are included and authoritative references support the stated terms. Unavailable or unclear mandatory terms are identified explicitly.
- README claims agree with the inventory and do not imply that the future tool license relicenses weights or generated output.
- All machine-verifiable preparation is complete before an unresolved project-license decision is handed to task 12.

## Preflight and recovery

Browsing authoritative terms is required for this task. Do not accept terms, change accounts or publish anything. An absent owner choice alone does not block preparation of this inventory; unavailable mandatory third-party evidence does block claiming this task's inventory complete. Keep the project-license decision at the end of the queue.

Follow the shared evidence and completion rules in [00-overview.md](00-overview.md). The runner owns implementation review and commits; do not commit from the implementation session.

## Evidence

Prepared 2026-09-09 against clean input HEAD `8571b4dfd2dfb933307bcfbf038ac768916593d3`. Read this task completely, queue, project specification, milestone 4, prerequisite task 09 evidence, extraction inventory, README, both Python locks, complete Node lock, config/model locks and setup → downloader → MLX backend/FFmpeg → QA → export companion flow. No repository/ancestor AGENTS.md exists on disk; supplied working agreements apply. Source Urban Wildlife root/assets instructions were inspected read-only for source licensing context.

Implementation: added [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md) with source provenance, all locked package versions, exact runtime/model/encoder/CLAP references, 11 artifact hashes/sizes, required Stability/Gemma attribution and three full upstream agreement copies. README links the inventory, credits Stability AI and preserves the separation of software/model/output rights. No source license was selected; no runtime, config, lock, test or task-runner change. No milestone checkbox was changed: the combined source-license/third-party-notice acceptance item still needs task 12.

### Mandatory evidence

- Source header/file inspection: `rg --files --hidden` for LICENSE/NOTICE/AGENTS, plus Python scans of the original factory/skill text and source ancestors, found no applicable project-code LICENSE/COPYING/NOTICE or copyright/SPDX/license grant header. Source root `package.json` has no license field. The extraction inventory binds copied inputs to source revision `00d64d6cbf71bf0f9d35832784d7a9aa3ffe35aa` and per-file hashes. Owner instructions authorize implementation/extraction, but contain no project-license choice. That missing decision is explicitly deferred to task 12, not treated as a task-10 blocker.
- Required browsing completed: `web.run` opened the pinned Stability runtime, Google Gemma terms/prohibited-use policy, Stability AUP (including its linked July 31, 2025 effective version), and FFmpeg legal documentation. The web tool could not render two pinned Hugging Face pages; read-only `urllib.request.urlopen` successfully fetched their exact-revision raw cards and terms instead. No login, acceptance or account mutation occurred.
- Read-only parallel registry/raw-source fetches returned HTTP 200 for **all 28 npm package versions and 37 distinct Python package/version pairs**, the exact official optimized-model card/Community License/Gemma agreement/NOTICE, CLAP card and exact repository trees, and runtime MIT license. Direct authoritative references and dates appear in the inventory. The Google upstream gated card returned 401; this is redundant evidence, resolved by the exact optimized artifact's public card and Gemma agreement plus the pinned runtime identifying `google/t5gemma-b-b-ul2` and embedded tokenizer. CLAP's exact card declares Apache-2.0; its exact tree has no separate LICENSE/NOTICE. Neither gap leaves mandatory terms unavailable.
- Inspected installed environment METADATA and available license/NOTICE files in task 07's retained `checkout/.runtime/{mlx-venv,qa-venv}/lib/python3.11/site-packages`, including composite NumPy/PyTorch declarations, Requests NOTICE, BSD wrapper versus libsndfile COPYING, and missing-metadata cases. Recorded SHA-256 for 232 installed metadata/notice files in `.test-artifacts/m01-10/installed-notice-sha256.json`. Binary redistribution is explicitly outside this source-only scope, with platform/native-notice requirements stated rather than claiming universal wheel coverage.
- `python3 .test-artifacts/m01-10/verify.py` passed: notice tables equal the complete 28-package Node lock closure (including all optional platforms) and 37-pair Python lock union; all npm registry integrity values equal the lock; all 11 model files/sizes/hashes occur in the inventory; all three agreement texts match downloaded sources after removing trailing line whitespace, and source SHA-256 values match original downloaded bytes. Logs/raw responses and fetch outcomes are in ignored `.test-artifacts/m01-10/` (`sources.json`, `fetches.json`, `*-license.txt`, registry `*.txt`).
- `node .test-artifacts/m01-10/links.mjs` passed, including the new notices file and README; reused task 09's link checker with the notices file added. Final pass: all **162** local links resolve. Manual README/inventory review confirms source distribution remains pending, attribution is visible, no future software license purports to relicense weights/output, and no CLAP/listening/historical metadata grants rights.
- `git diff --check` and `git diff --no-index --check /dev/null THIRD_PARTY_NOTICES.md` reported no whitespace errors (exit 1 denotes the new-file difference) after removing an extra EOF blank line and upstream trailing whitespace from agreement copies. Documentation-only scope checked against input HEAD; no staging or commit.

Exact unchanged input SHA-256:

| Input | SHA-256 |
| --- | --- |
| `config.json` | `bac3498052b35e101ff582ad21a06f5bb12bb8f2bff995b4785f005dbfb0d1dc` |
| `qa-model.lock.json` | `a28643e40969ac223ed36a197c4590c9f3d3e073c7e30aab40415b282170b7eb` |
| `pnpm-lock.yaml` | `12a4164a82fff196d3802096274a083e78f141a61153d1334f054ce7ba1e439e` |
| `requirements.lock` | `e38396e526d5e27cc5d4bd36d5802f876d82042b5a1a6ad3c77e74d24395cb3a` |
| `qa-requirements.lock` | `1dc953bf9b14a297325dd307ef7e75401a80e8723bc51bfe958bc1a63498a42f` |

### Inherited evidence, release handoff and recovery

Tasks 07–09 supply setup, smoke, retention and cleanup evidence under `/Users/haukebrinkmann/Library/Caches/audio-factory-m01-07`. A Python SHA-256 comparison against `task08-input-sha256.json` passed for all **45 non-Markdown inputs**. No executable or lock/config input changed in this task; no fresh setup, build, fixture suite, generation, listening or smoke run was needed or performed. No browser UI/demo is specified (this is a CLI); authoritative web browsing did run. No cleanup of model/service processes was needed because none was started. No mandatory task-10 check remains unrun. Broader binary packaging and commercial-use clearance are not claimed.

The concrete remaining release list is in the notices: task 11 source-list/clean-checkout audit; task 12 owner-authorized project license; correction of the inherited GGUF terms reference in future companions with affected provenance verification, preserving old records; recheck policies and intended-use registration/enterprise conditions before release. The official MLX terms are fully available and inventoried here; the historical reference is explicitly not used as authority. Task 10 does not implement the later release/license tasks or pause for owner acceptance.

External mutations: none. Local mutations are the notices/README/task evidence and overview status, plus ignored `.test-artifacts/m01-10/` text snapshots, hashes and check helpers. Source repository, existing cache/environments, model weights, retained audio, tokens and process state were untouched. There is no unfinished recovery; rerunning these read-only checks is safe and does not redownload weights. Review/commit belongs to the runner.
