# 02 — Expose the local studio and shared job workflow

Status: [x] Complete

Overview: [M2 queue](00-overview.md) · [Project](../../project-overview.md)
Milestone: [M2 — Review studio and automatic quality control](../../milestone/05-review-and-quality.md)
Depends on: [01 — Persist candidates and human feedback](01-durable-review-store.md).
Expected duration: 45–90 minutes.

## Outcome and scope

Add a loopback studio command/server that stays available for history and playback while compute subprocesses are temporary. Reuse the generation/setup/QA/cut/bundle implementation in a shared workflow called by studio and agent/CLI entry points; do not duplicate the pipeline or remove existing commands. Implement bounded, persisted job submission/status/cancel and candidate/review/export endpoints. A submitted request returns an identity promptly, with progress readable after refresh.

Implement browser session bootstrap, exact same-origin/Host validation and mutation protection. Keep the existing bearer token server-side and preserve legacy non-browser authentication/Origin rejection. Serve only registered candidate assets, support native audio playback and safely render no HTML from prompts. One owned compute job at a time; repeated submission attaches to the same job. Persist generated candidates before startup can clear temporary output. Graceful shutdown drains/stops owned work, not unrelated processes.

## Required checks and review demo

- With a controlled backend, submit, reconnect, cancel and restart a job; no duplicate generation or lost candidate/feedback.
- Access candidate audio and export through registered IDs; reject traversal, unknown IDs, foreign Origin/Host and missing mutation credentials.
- Confirm the legacy authenticated API remains usable and browser protection was not replaced with wildcard CORS.
- Verify the studio remains available after compute exits and that closing it cleans up owned work.

## Preflight and recovery

Preflight a free loopback port and existing process ownership. Use controlled generation and isolated persistence roots for checks; never invoke real `make` against wanted output. Use bounded graceful stop followed by owned-process termination only if needed. Record interrupted state before any retry; require explicit resume when a generation outcome is unknown.

Follow the shared execution, evidence and completion agreement in [00-overview.md](00-overview.md). Implement only this task and its integration needs, update this status/overview plus directly supported milestone items, and leave later tasks to the queue. The runner owns review and commits; do not change the runner or commit from the implementation session.

## Evidence

Implemented and verified on 2026-09-09 against input revision `5ccc2fab80602209ebff7b98e88811e5d634abe6` (clean starting tree). Read the complete task, M2 queue, project overview, milestone specification, task 01 evidence and relevant CLI/service/backend/setup/QA/store/bundle/ownership paths. No repository or ancestor AGENTS.md file was present; the supplied owner working agreements applied. No commit or runner change.

Preflight: Node `v22.22.3`, pnpm `9.15.9`, FFmpeg, installed signal Python environment and agent-browser were available; 681 GiB free. `lsof -nP -iTCP:8766 -iTCP:8767 -sTCP:LISTEN` found no listener. All generation checks used fresh owned roots and controlled synthetic subprocesses, with real signal analysis, FFmpeg cutting/normalization and bundle verification. No real `make`, model download or cloud operation ran against this checkout or wanted output.

Implementation:

- `./run studio` binds `127.0.0.1:8767` without setup/model loading, serves native playback/history and remains alive after temporary compute on the existing factory port exits. Ctrl-C persists cancellation and stops/drains owned work. The full prompt/review frontend stays in task 03.
- `workflow.mjs` is shared by studio submission and CLI `make`/`generate`: existing setup, authenticated generation, QA, cut and bundle implementation remain the pipeline. CLI results preserve existing fields and add the durable candidate hash. Source-only snapshots are verified and saved before QA, then QA evidence and the delivered cut are saved before completion. Previously completed unregistered sources are rescued before session cleanup. Generation/backend pins and QA/cut semantics are unchanged.
- Atomic job records persist keys/signatures, chosen seeds, status/progress, candidates and results under `.runtime/studio/jobs/`. One verified process owner and one active job; no queue or automatic replay. Repeated keys attach, mismatches conflict and concurrent new work returns 429. Restart records unfinished work as interrupted and requires explicit resume with a new key. Resume preserves the original uncertain outcome and records the new identity before launch. Persistence write failures prevent subsequent cleanup.
- Browser bootstrap uses a bounded, expiring HttpOnly/SameSite=Strict session, exact Host/Origin checks and CSRF headers for mutation; bearer credentials remain server-side. Non-browser bearer access still rejects Origin. No CORS allowance is emitted. Registered-ID candidate/audio/feedback/export endpoints validate assets; WAV single ranges support native playback. TAR exports contain the verified original/prepared/metadata bundle plus candidate and immutable feedback records. Prompts use `textContent`; CSP restricts script/media/connect sources and framing.
- Setup cancellation now escalates from SIGTERM to SIGKILL after five seconds for its owned process group if needed. Existing QA subprocess deadlines bound draining. [Usage](../../usage.md#local-studio-service) documents commands, endpoint/auth contracts, recovery and lifecycle differences from the legacy manual service.

Executed checks:

1. `pnpm build` — passed, including the final implementation.
2. `node --test studio.test.mjs` — passed. Final focused log: `.test-artifacts/m02-studio-focused.log`, root `.runtime/studio-test-WWM5La`. The controlled smoke verifies prompt return of persisted identity before generation completes, selected seed, duplicate attachment, key conflict/contention, invalid/bounded input, Host/Origin/CSRF rejection, cookie flags, legacy authenticated health and Origin rejection, no wildcard CORS, registered paths/unknown IDs/traversal, audio ranges, immutable feedback retries/conflicts and exported bundle verification. Compute exits while studio history remains available.
3. The same smoke tests cancel/explicit resume, preserved rejection across another generation, rescue of an orphan completed source before `out/` cleanup, and a separate Node process deliberately exiting 23 after recording a running/generating job. Restart after store relocation and deletion of only fixture `out/` records interrupted state without generating; accidental new submission is refused and explicit resume works. Shutdown stops owned synthetic children, whose identities are checked absent. A real isolated setup subprocess ignores SIGTERM and is killed within the bounded escalation (focused PID 35555); no setup/model download occurs. Occupied studio/compute ports preserve a sentinel and an unrelated listener.
4. `pnpm test:audio-factory > .test-artifacts/m02-studio-tests.log 2>&1` — final run passed all **10 Node checks and 2 Python checks**. Includes existing legacy service/ownership, QA/cut/recovery, durable store, portable retention and isolated frozen-install/build/bootstrap coverage; the isolated copy now includes/imports the new workflow/studio modules. Final studio root `.runtime/studio-test-MCYGq2`, generation PIDs 35888/36192/36222/36453 (the log is authoritative), setup PID 36532; all owned roots/processes removed.
5. `node studio.test.mjs --browser-fixture` — created owned root `.runtime/studio-browser-YDyLMD`, process 33629, URL `http://127.0.0.1:61466`. `agent-browser --session m02-studio open http://127.0.0.1:61466`, `snapshot -i`, `click @e7`, browser `eval --stdin`, `download @e4 .test-artifacts/m02-browser-export.tar`, `reload` and `close` performed an actual Chrome journey. Native playback reached `ended: true`, `currentTime: 1`, `duration: 1`. The malicious-looking prompt was visible text, created no image and executed no handler. `document.cookie` was empty and page HTML contained no bearer token.
6. Browser evaluations fetched the bootstrap CSRF credential, confirmed a missing-credential mutation returned 403, submitted and repeated `browser-reconnect`, refreshed and reattached to job `9c122c4372236eeeee0c7b810ba298cd`, and observed completion. They appended explicit synthetic rejection to candidate `ee012bbef0f17d0ab36c4231de0d5d73e67c15ecfcf1e1187a8801856077a321`; a separate `browser-cancel` job `c2544f5021dee8dc308fbc04dd3ba708` returned 202 then canceled. These are synthetic labels, never listening acceptance. Screenshot `.test-artifacts/m02-studio-browser.png` was visually inspected; it shows readable prompt text and native original/prepared controls.
7. An inline Node check extracted the **browser-downloaded** TAR into `.test-artifacts/m02-browser-verify-Idjqux`, ran `verifyExport` against the actual extracted audio/source/metadata, then removed that directory. The browser fixture was stopped only after verifying its PID command identity; its process/root were confirmed removed, and the named browser session closed.
8. An inline Node isolated CLI smoke copied only required modules/config/schemas into `.runtime/studio-cli-OAYhPd`, launched `node <fixture>/dist/cli.js studio`, observed its ready message and HTTP 200, verified no `out/` or setup log was created, sent SIGTERM and awaited exit 0, verified the socket closed and ownership claims were released, then removed the fixture.
9. `git diff --check` — passed. Final process/port inspection found no remaining factory/model/setup/browser-fixture process or listener on 8766/8767. Existing unrelated runtime/cache contents were preserved.

The first focused Host test failed because Node fetch replaced its supplied Host header. A minimal local server comparison demonstrated `fetch` sent the URL Host while `http.get` sent `evil.test`; the test now uses raw HTTP and the actual foreign-Host rejection passes. No product bypass was introduced.

Artifact/input SHA-256 (timestamps mean candidate/TAR identities vary between fixture runs):

| File/artifact | SHA-256 |
| --- | --- |
| `workflow.mjs` | `7185949ab80745d8010aa0566a092439efe0ff717459b8504843eb2718970e89` |
| `studio.mjs` | `abf32c763820707c62251f781608b815fbed470ce7a41a00c4250f92764f8df5` |
| `studio.test.mjs` | `52a84f45d2ba9a564fd53a9a06d25a758a842f3d4ea066180763dbb5b489c83c` |
| `src/cli.ts` | `30a63cb984bc7233973e4fa2ed804396c13d2e9f4e61a8fb220b3770b5710f18` |
| `src/setup.ts` | `febdfd17d35927e0084eb0a4a07fd0af6ec3e1fab40d64a1324448624bc20a7a` |
| `standalone-core.test.mjs` | `c21b4d4f034d778c3d9fb0e0d6ee810f5308d92c4b27a7bf8a44106bd45e8894` |
| `package.json` | `ed54b9c794315e689ef80f2b7017eb20e9d25963f51b507a41e6922467821685` |
| `docs/usage.md` | `3e5bf34decb795251c99dccbe791d608ca8819a6044c597473b3318d97186c27` |
| Synthetic source WAV | `f5af57e6de9a850a1a8e46feace23bed6dcb67e4255931e9124298a1a220a719` |
| Browser-delivered WAV | `e66711a8511a0a6b332cb4e7915914f1b19498125ec5154ba724729b7ac39048` |
| Browser-downloaded TAR | `cb946b082f46f111ef67706d732601693631820345d5b0263eb48131354ec655` |
| Browser screenshot | `456f9cd815acd4a1966223879d5ca6dc41db4785948efd83d1de295b943c6740` |
| Unchanged `src/backend.ts` | `97796af9dacb98a61dfb2b928b1b629f6c39347140a5f4e932591b5c370a46e2` |
| Unchanged `src/qa.ts` | `8bbc635818f1fe167e6fdaf1471c57d90723e4711eab888e5312449f7d479c75` |
| Unchanged `config.json` | `f4297004a9715c3d8157d3953c41de51312b55d21dd7262b1e353bb2ff434ea0` |

No mandatory check remains unrun. Real MLX/CLAP inference, `pnpm audio:smoke`, human listening, judge evaluation and the later complete review frontend were not run; this task specifies controlled generation and inherits unchanged M1 backend/pin evidence. No acoustic-quality claim is made. Logs, downloaded fixture TAR, browser manifest and screenshot remain only under ignored `.test-artifacts/`; operational fixture roots and children are gone. No owner acceptance gate applies.

Final review-and-fix pass, 2026-09-09 (same input revision, no recovery commits): fixed a resume transition that persisted `resumed_by` before detecting a conflicting replacement key, allowing unrelated generation past the interrupted-outcome guard. Conflicts now leave recovery unresolved; a reserved replacement must exist before ordinary submission is unlocked, and repeated resume attaches to that one replacement rather than allowing a second key. The focused regression failed before the fix and passed afterward, including retry after reopening the store.

`pnpm build && node --test studio.test.mjs` passed both checks after the fix. The controlled smoke used `.runtime/studio-test-ajr9tn`, generation PIDs 38363/38426/38447/38498 and setup PID 38560; the test verified their exit and removed its roots. `git diff --check` passed. Existing browser/server, backend, QA and configuration hashes still match the evidence above; the actual browser screenshot and downloaded TAR hashes were also rechecked, so that unchanged evidence is inherited. No real generation or human listening was performed and no commit was created. Updated SHA-256: `workflow.mjs` = `88016935c6aa73fc4e87e093f8edf7c1e40851d0b57c8c1520d150d387c8832e`; `studio.test.mjs` = `3a0982ba4eab4794919e6f7c1ead3290b14e7c1cd93f3940b2fb3ef99c5b5302`.
