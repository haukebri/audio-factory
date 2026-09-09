# 07 — Verify the studio and quality loop end to end

Status: [x] Complete — real pre-migration studio integration verified; quality_not_established (2026-09-09)

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [06 — Use human feedback for repeatable quality evaluation](06-feedback-evaluation.md).
Expected duration: 45–90 minutes plus setup if missing.

## Outcome and scope

Verify the assembled local studio, shared agent workflow, real judge, retained candidates and human feedback persistence on the supported machine. First bind current runtime/pins to prior evidence and run only affected checks. Use a dedicated verification store and preserve wanted output before any real generation.

Run a maximum of three new real generations in one bounded request using the local generator and judge. A real judge is allowed to accept, reject or remain uncertain; never manipulate its verdict to manufacture a rejection demo. Use the already validated controlled reject→accept case to prove retry mechanics if the real sample does not naturally reject. Listen only if an actual audio-input tool or owner is available and record who listened; model verdict is not human approval. Drive the real browser from prompt through playback, feedback persistence and complete bundle export, then restart and verify the same history. Any agent-created fixture feedback stays tagged synthetic.

Update user/agent instructions, prerequisites, source inventory and milestone product acceptance based on exact evidence. State measured quality separately using task 06; missing human benchmark evidence remains quality_not_established. Record defects and fix in-scope integration failures before closing this task; do not claim the full quality outcome on task counts.

## Required checks and review demo

- Build and affected regression checks pass; browser screenshots show usable normal/failure/reconnect states.
- Real generation and audio judge consume matching source/derivative hashes; exported bundles validate after relocation and later sessions.
- Candidate history, feedback and selected policy survive restart. No wanted output is lost; no compute/model subprocess remains.
- CLI/agent and browser results agree on request identity and verdicts. Auth/origin/path and cancellation checks pass.
- Documentation links and whitespace pass; evidence distinguishes real jobs, synthetic review events, model verdicts and actual human labels.

## Preflight and recovery

Preflight Node/pnpm/Python/uv/FFmpeg, Apple Silicon memory/disk, browser control, free owned ports and all pinned model manifests. Reuse caches and task 04's setup. Default maximum three generations, 20-minute request budget after setup; do not repeat successful real jobs just to refresh documentation. Preserve every candidate before the next session and clean only owned fixture/store/process state. No commit by implementation session and no publication.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Executed 2026-09-09 from clean input revision `c4a63e7193048da0c6b3d210c011be1405c3bc92`. Read the full task, queue, milestone specification, project overview, predecessor evidence, supplied working agreements and the workflow/backend/setup/QA/store/judge/studio/CLI/evaluation/export paths. No repository or ancestor AGENTS.md file exists. No runtime code change was necessary; corrected stale user/agent instructions, prerequisites and source inventory. No task-08 implementation, runner changes, staging, commit or publication.

### Preflight and evidence reuse

`uname -m`, `node --version`, `pnpm --version`, `python3 --version`, `uv --version`, `ffmpeg -version`, `sysctl hw.memsize`, `memory_pressure`, `df -k .` and `lsof -nP -iTCP:8766 -iTCP:8767 -sTCP:LISTEN`: arm64, Node 22.22.3, pnpm 9.15.9, bootstrap Python 3.14.4, uv 0.10.11, FFmpeg 9.0.1, 34,359,738,368 bytes RAM, 80% memory free, 705,760,972 KiB disk available; both ports free. Named agent-browser control worked. No audio-input tool was available; no owner listening occurred.

All private evidence is under **`.runtime/m02-integrated/`**. `input-hashes.json` records every tracked input. `inherited.json` verifies all 11 applicable entries from task 06's final review hash manifest, including workflow, judge, policy, store, evaluator and browser files. Task 04's actual contrasting-audio capability and task 05/06 controlled recovery/evaluation evidence remain applicable. Generation requirements, QA requirements, Node lock and model pins are unchanged. No successful real job was repeated to refresh evidence.

Created an isolated tracked-input checkout with its own output, token, durable studio store and evaluation registry. It reused Node dependencies, M1's existing generation runtime/environment under `/Users/haukebrinkmann/Library/Caches/audio-factory-m01-07/checkout/.runtime/`, and task 04's QA environment/manifest/cache. `MlxBackend.start()` verified clean runtime revision `779434a908193105335fd8d833418603625b2859`, full generation lock, Metal and all three model hashes. Independent SHA-256 checks verified all eight Larger CLAP General manifest files against `qa-model.lock.json`; `uv pip freeze --python .runtime/qa-venv/bin/python` exactly matched the QA lock. Both reused environments are Python 3.11.15. No setup, downloads, cache mutation or production policy selection was needed. `preflight.json` retains the manifest and registration evidence.

Selected the unchanged experimental default through `openEvaluation(...).freeze/register/select` in the isolated registry, before generation, to verify persistence of an explicitly selected policy. Its ID is `7787ae4ca1ea865954bcfdbc7e3d8ccde538fa28c32cd4ed5f5c2adfe3a79608`. `mutations.log` records isolation, selection, real request, fixture copy, exports and relocation. Durable job checkpoints record candidates and attempts immediately.

### Real request and browser evidence

`pnpm build` passed in the working checkout and isolated copy (`build.log`). Started the actual `node dist/cli.js studio` on port 8767, PID 3158, log `studio.log`. Session `agent-browser --session m02-integrated` used `open`, `snapshot -i`, `fill`, `select`, `click`, condition-based `wait`, `reload`, `eval --stdin`, `download` and `screenshot --full`.

The browser submitted **one bounded automatic request**, prompt `A single dry wooden knock, close and clear.`, 3-second duration, maximum three attempts/20 minutes. Request `e70308213c20df6dbc93ef0e5b56cb11`, seed **362935076**, generation `35e73b72d36d256a051c2c9131c46992`. It performed **one real MLX generation and one real delivered-audio judge invocation**, completing in **25.066 seconds** (judge 12,224 ms). The real policy naturally returned **needs_review / uncertainty_band**, so no retry was launched. The controlled reject→accept check supplies retry evidence; no verdict or threshold was manipulated.

Real candidate `c48ecc4467e0f93e5d0435895f426a6525f9a50ae18c14f46a5e4df5b833dc29` contains matching generation/source/cut/judge lineage:

| Evidence | SHA-256 / value |
| --- | --- |
| Source WAV | `32d9b8d11abdc0c701ebb3afad97e1424639ee2e6b4de786785b5a87038ecbd2` |
| Delivered WAV / judge input | `4db9bbfc06925a48dcf783bb4e84673a5961e98c4b61f9d3af06d9e659d76800` |
| Decoded mono 48 kHz PCM | `740fbb3174e0fbfa269a9ab926b6777b7913ef1b8d61bca2c1f362af0abf5e05` |
| Judge revision | `ada0c23a36c4e8582805bb38fec3905903f18b41` |
| Policy SHA-256 | `7a3460d0778854baa30454e2f67f5d4d5dd335df507cd2c0f332b6155a2ccda5` |
| Target / static / helicopter / silence | 0.258984506 / 0.058374926 / 0.027369758 / −0.092051528 |
| Target margin | 0.200609580 |

The prepared region is 0.77–0.89 seconds of the original (0.12-second playback). Signal analysis detected two regions; neither the prompt's single-event wording nor region 1 establishes acoustic correctness. Native prepared and original playback reached `ended`, without media errors. This is technical playback, **not actual listening or human acceptance**. A bearer-authenticated agent GET and browser GET returned deeply equal complete job/policy/verdict records (`agent-agreement.json`, `browser-evidence.json`).

Refresh during execution attached to the same request. Browser export produced `real-export.tar` with no human labels. A separately saved **fixture-tagged copy** `d22dbdf55edefbf1f3a75b03feb6d0b740ad9bb8a4ab059db3c20113e597e716` exercised rejection validation and feedback persistence. Event `9af99c5f5512474f9e9b9dcc3ab4b5a1` has reason `other` and note “Synthetic integration event on fixture copy; no human listening or acoustic judgement.” Its `actor: human` is the product's feedback schema, **not listening provenance**; `fixture: true` excludes it from real metrics. The real candidate remains unlabelled. `fixture-export.tar` retains the tagged candidate and exact event.

Stopped PID 3158, preserved its complete `out/` as `preserved-output/`, and moved the isolated checkout to **`relocated/`**. Original checkout/output paths are absent. Restarted the actual CLI studio at the same URL, PID 5354 (`studio-restarted.log`). Refresh connection restored the same request, selected candidate, synthetic feedback and selected policy; native playback succeeded again. `restarted-export.tar` was downloaded in this later session and validated with exact feedback equality. `restart-agreement.json` and `restarted-browser.json` retain the assertions.

Inspected `normal.png`, `failure.png`, `disconnected.png` and `restarted.png`: usable controls, readable status/recovery actions, separate model/human state and no horizontal overflow. `reconnect-running.png` also records refresh during execution. The failure screenshot shows rejection without a reason; the disconnected screenshot follows actual process shutdown. Initial automation called playback before async selection finished, used unsupported download selectors/actions, and placed screenshot paths in the selector slot. Corrected commands/condition-based waits passed; these were harness mistakes, not product defects. The skill validator initially lacked PyYAML under bootstrap Python; the existing QA interpreter ran it successfully without installing anything.

### Automated, persistence, quality and cleanup checks

- `node --test quality-loop.test.mjs studio.test.mjs studio-frontend.test.mjs evaluation.test.mjs > .runtime/m02-integrated/affected.log 2>&1`: **11 checks passed**, zero failures/skips. Covers controlled reject→accept/exhaustion, exact counts/seeds, cancellation/timeouts, alternate cuts, interrupted-stage recovery/relocation, preserved prior feedback, CLI reattachment, auth/Host/Origin/CSRF/path boundaries and cached evaluation/rollback. Prior unchanged full-suite and judge capability evidence is inherited; no unrelated suite cleanup.
- `node .runtime/m02-integrated/check.mjs checkout`, then `node .runtime/m02-integrated/check.mjs relocated`: passed. The retained runnable check verifies every candidate via the store, actual source/delivered/judge hash equality, selected policy, exact real generation count, both browser TARs through `verifyExport`, synthetic feedback exclusion and byte-identical repeated holdout results. Extracted bundles remain in `checkout-{real,fixture}-bundle/`, `relocated-{real,fixture}-bundle/`, and `later-session-bundle/`. The first command is historical; rerun the second against the retained relocated store without inference.
- Actual collection: **five candidate snapshots, two unique real audio hashes (source and cut), one synthetic copy, zero real labels/approvals/rejections/labelled families**. Missing **100 clips, 50 approved, 50 rejected, 10 families**. `relocated-verification.json` records `quality_not_established`; benchmark `a9a55cfc2cc4a54c2fad81c3878dcf398fcc8784b0c1c387c32872448ae404cb`, repeated holdout result `7b60d8ab53eec7712e437d327d772256ef07edf3d4be974dda8b8637eaff3dad`. No policy calibration or quality improvement claim.
- Closed the named browser and both owned studios, awaited clean exit, reopened `openJobs` in a separate Node process with an executor that throws on computation, and verified the same one-attempt completed request. `cleanup.json` confirms both studio PIDs and the backend-owner PID absent, ports 8766/8767 unreachable, no matching model/QA/test subprocess and no recreated output. Fixture regression roots were removed by their checks. Wanted candidate/store/output evidence, caches and environments remain preserved; the working checkout's original output was absent and remains absent. Nothing needs recovery; reopening the retained studio is read-only until an explicit new request.
- `.runtime/qa-venv/bin/python /Users/haukebrinkmann/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/audio-factory`: passed. Local documentation link/fragment validation and `git diff --check` passed; final hashes are in `final-hashes.json`.

**Not run / not claimed:** `pnpm audio:smoke` would create two additional separate requests, so it was not run; this task's bounded real integration request supplies new smoke evidence. No extra generation, human listening, full acoustic benchmark, model rescoring or full-suite rerun was needed. Unchanged controlled and model capability evidence was reused as specified. All mandatory machine-verifiable work is complete; no owner-acceptance gate applies. The pre-migration integration is verified; task 08 and milestone quality targets remain open.
