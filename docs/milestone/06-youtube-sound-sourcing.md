# Milestone 6 — YouTube takes in the batch editor

Status: implemented and technically verified on 2026-09-13. The owner-selected workflow is integrated into Studio. The accepted [standalone proof of concept](../../experiments/youtube-sounds/README.md) remains runnable and is not a runtime dependency. Evidence and limitations are recorded below.

## Owner-selected outcome

Add a **YouTube** button to the editor for each sound in a batch. It opens a popup containing the proven search, embedded video playback and interval-download workflow. After import, the downloaded audio appears as another normal take card for that sound. All subsequent editing and winner selection use Audio Factory's existing audio workflow.

Example: a sound has five generated takes. Importing one YouTube interval adds take 6, labelled **YouTube**. It can be played, trimmed and selected exactly like takes 1–5. Importing another interval adds take 7. Saving a trim of take 6 creates a version of take 6, not take 7. The batch's selected-winner functionality remains the authority for which exact audio is delivered.

Use **yt-dlp** for search and acquisition. The YouTube iframe is for auditioning only; the official Data API is excluded. No metadata catalog, attribution UI, source-archiving feature or new export bundle format is requested. Retain only the operation identity and audio records needed by the existing workflow.

## User workflow

### 1. Open YouTube for the current batch sound

Place **YouTube** beside the existing per-sound generation controls in the batch editor. It acts on the currently displayed sound, not the whole batch and not whichever candidate happens to be selected.

Open a native modal dialog titled **Find audio on YouTube**, showing the target sound's name. Capture the batch ID and sound key when opening. Prefill an editable search query from that sound's current prompt draft; do not submit a search until the user clicks Search. A draft prompt supplies discovery wording only: importing must not submit or overwrite that draft.

The popup contains only:

- Query and Search button; up to ten deduplicated results with **Play here**.
- One embedded player, initially showing the first result without autoplay; choosing another result switches it and fills the video URL.
- Pasted-video URL, start/end seconds and **Add audio to this sound**.
- Readiness, queued/download/conversion progress, errors and an explicit Cancel import action when applicable.

Keep an external-player fallback for videos that disallow embedding. Do not include the POC's **Make the cut**, gain control, local clip list or WAV-download workspace in this dialog. Local-file upload is not required by this batch integration milestone; it remains available in the POC for troubleshooting.

Use the dialog's focus trap, Escape/backdrop/Close behavior and return focus to the YouTube button. Opening/playing a video pauses local audio and trim/loop previews. Closing or replacing the dialog unloads its iframe so hidden audio cannot continue.

### 2. Choose and import an interval

The user listens inside the popup and enters start/end times on the video's timeline. Preserve the working POC's finite interval behavior: positive duration up to 60 seconds, including fractional seconds. This is independent of the batch generation-duration presets.

**Add audio to this sound** submits one import for the captured sound. Disable duplicate submission while acceptance is uncertain; retain the same idempotency key for retries. Show the accepted operation as queued or importing. A sound with five generated samples still has five audio cards until the import produces a validated candidate; a progress row is not a playable take.

Closing the popup after submission closes the UI only. The accepted import continues and its status remains visible in the sound's normal operation list. **Cancel import** explicitly cancels that operation. Reopening the popup for the same sound reconnects to its pending import and restores its query/URL/time draft. Refreshing Studio must do the same.

On successful durable save, close the matching popup, refresh that sound's take list and reveal the new card. If the user navigated to another sound or opened a different popup, keep their current view and show a completion notice for the original target. Never attach the result to the sound currently selected at completion time.

A failed or canceled import leaves prior takes and the selected winner intact. Preserve the popup inputs and show a specific retryable error; never substitute a generated sound.

### 3. Use the normal take card and editor

The result is local **audio**, not a video card or an embedded player in the take list. It uses the existing playback, waveform, duration display, **Trim**, **Use this take**, Download and Library behaviors.

- Label the source **YouTube**, using the normal take numbering for the sound. Keep the five original variants as-is. The new operation can use the existing grouped layout, but must appear as an additional take for the same sound, not a new batch sound or a separate YouTube collection.
- **Trim** opens the current Studio audio editor, including draggable/keyboard-adjustable bounds, preview, Level, fades, loop/crossfade controls and version saving. The POC editor and its custom PCM/gain renderer are not the integrated editor.
- The import preserves the full user-selected interval. Do not run the generated-sound “first active region” crop and silently remove parts of that interval. Treat it initially as an ordinary non-loop clip; use the existing editor to make a loop when wanted.
- Editor time zero is the start of the imported audio interval. A video import of 120–125 seconds is a five-second source; trimming 1–3 seconds edits that local source. Expanding beyond the imported interval requires another import.
- Importing does not select a winner. **Use this take** selects the exact imported or edited candidate through the existing selection event/history mechanism. Saving another trim likewise does not silently change the winner.
- The selected winner, Library entry, batch ready state, winners manifest and downloaded bytes must refer to the same exact candidate, whether its source was local generation, ElevenLabs or YouTube.

Importing must not change the sound's prompt, generation duration or loop draft, generate five more variations, or call ElevenLabs. Explicit later generation continues to use the sound's generation request. If the existing “Generate with ElevenLabs” action is available on an imported take, it generates from the sound description, exactly as the existing text-to-sound action does; it must not suggest that video audio is sent as a reference.

## Technical design

### Reuse the POC boundary, not its application

Extract/adapt the yt-dlp URL validation, bounded search, timestamp acquisition, cancellation and FFmpeg decoding in `experiments/youtube-sounds/audio.mjs` into a small factory-owned module, for example `youtube.mjs`. Keep the experiment runnable as a reference. Do not run its second HTTP server or copy its separate jobs/clip store into Studio.

The module returns a decoded source file and actual audio properties to the normal workflow. It does not select a winner, render cards or create its own library. Discard unneeded extractor fields and temporary compressed media after the WAV is retained. Do not store the entire video.

Acquisition may fetch one second of context either side for seeking, then crop locally to the requested interval. The retained source is exactly that requested interval. Use FFmpeg/ffprobe to decode into stereo 44.1 kHz PCM16 and meet `src/wav.ts` validation. Reuse the existing normalization/rendering code rather than copying the POC's independently implemented gain behavior. Record actual decoded duration and reject truncated coverage. Section retrieval is not a guarantee of sample-exact synchronization with YouTube's player timeline.

### Batch operation and API

Add these proposed routes to the existing authenticated Studio service:

| Route | Input / result |
| --- | --- |
| `POST /studio/youtube/search` | `{ query }` → `{ results: [{ id, title, url }] }`; bounded read-only discovery with no durable batch mutation |
| `POST /studio/batches/:batchId/sounds/:soundKey/youtube` | `Idempotency-Key` plus `{ url, start_seconds, end_seconds }` → HTTP 202 with the updated batch operation, including its stable `job_id` |

Use existing job polling, cancellation and recovery routes for accepted imports; do not introduce a parallel job-status protocol. Expose YouTube tool readiness alongside the existing `/studio/readiness` data. Browser requests use Studio session/CSRF protection; agents use the existing bearer path. Do not copy the POC's `X-Poc` shortcut into Studio.

In `batches.mjs`, add an append operation using the existing serialized persistence/idempotency machinery. Validate the batch/sound, canonical URL and interval before enqueueing. The server derives the sound identity from `sound.operations[0].job_id`; the browser does not choose an arbitrary parent candidate or `sound_id`.

The operation uses `provider: 'youtube'`, its import bounds and `sound_parent_id` pointing to that existing sound. Identical retries with the same key/input return the existing operation; conflicting input or reuse against another sound returns 409. Separate explicit imports with new keys may create separate takes, including re-importing the same interval when intended.

Reuse the batch queue and single active-work ownership. Import can be queued while generation is running; it does not interrupt that generation. A paused batch holds queued imports just as it holds other queued work. Allow search/playback while compute work runs. Execution must bind the candidate to the original sound even if the initial generation failed, provided the durable sound/job identity exists.

### Dedicated import execution inside the shared workflow

`workflowInput`, `openJobs.submit` and `openJobs.start` in `workflow.mjs` currently assume generation. Introduce an explicit YouTube input/execution branch before prompt planning, seed allocation and generation retries:

1. Persist the accepted job and immutable target/input identity.
2. Resolve/acquire the selected interval with owned subprocesses and bounded retries.
3. Decode, validate and persist the interval as the candidate's durable source WAV.
4. Prepare an initial full-interval delivered version through the existing cut/render path, with explicit full bounds. Do not use automatic first-region selection or treat imported audio as a native provider loop.
5. Save the candidate, attach its result to the import job and complete the batch operation.

One import produces one take/attempt with no invented seed or model. Preserve the job's candidate/attempt linkage so later trims are versions of that take. Existing `candidateSound()`, `groupTakes()` and selection history must resolve it to the parent batch sound, not the import job as a new sound.

Keep the first delivered candidate available for immediate selection/export; editing is optional. If the source is already retained but preparing the delivery fails, recover from that source rather than redownloading or marking an incomplete export as ready.

### Minimal record compatibility

Existing candidates and cuts reference `evidence.generation` and the factory run schema throughout the store, editor and exports. Retain that legacy envelope for compatibility; extend it with a clearly discriminated YouTube/import runtime branch. Its meaning for that branch is source acquisition, not model generation. Do not rename the entire historical record model for this feature.

Keep the common ID, status, source hash, actual WAV properties and intent fields required by existing consumers. Store canonical video ID/URL and requested bounds only where needed to retry the accepted import. Make model, seed and generation-specific settings inapplicable to the import branch, rather than filling them with fictitious values. Do not invent a source license to satisfy existing required fields.

Handle fractional and sub-0.5-second imports in the import branch explicitly: current `request.schema.json` and the embedded run request schema have a 0.5-second generation minimum, while the POC accepts any positive interval up to 60 seconds. Preserve existing generation constraints and duration presets. Define interval positivity in decoded samples so rounding cannot produce an empty file.

Extend `run.schema.json`, store validation and export verification as needed to accept this branch while retaining existing hash, sample-bound and exact-version checks. Use the current retained-source/derivative bundle; no additional source archive or metadata feature. Old local/ElevenLabs records must remain readable without migration.

### Specific integration points and traps

| Current code | Required treatment |
| --- | --- |
| `studio.html`, `studio.js`, `studio.css` | Add the batch-sound button/dialog. Reuse `renderClip`, `trim`, `useTake` and normal refresh behavior. Preserve focus, playback and editor drafts during polling. |
| `studio.js`: `identity`, `renderBatch`, progress labels | Replace binary Local/ElevenLabs labels with an explicit YouTube case. Show “Importing audio”, one take and its normal number, not “Generating 1/5” or a fabricated generation count. |
| `batches.mjs`: `append`, `pump`, `describe` | Append imports under the existing sound and queue. Keep winner counts independent of take source; terminal import failure/cancellation must not strand export readiness. |
| `batches.mjs`: `revise`; `studio.js`: batch prompt initialization | These read the latest operation's request. An import must not become the default next generation prompt/duration/loop; use the latest generation request or existing sound request/draft instead. |
| `workflow.mjs`: job creation/start, `candidateSound`, `cut` | Bypass generation only for imports; retain ordinary candidate ownership, recovery and cut routes. No seed allocation or deterministic regeneration loop for downloaded audio. |
| `review-store.mjs`, `run.schema.json`, `export.schema.json`, `export-lineage.mjs` | Admit truthful imported-source records within existing candidate/export contracts; retain integrity checks. |
| `src/qa.ts`, `src/wav.ts`, `loop-audio.mjs` | Reuse full-bound initial delivery, existing trim/gain/loop processing and format checks. Avoid first-region recutting and duplicate normalization logic. |
| `library.mjs`, `batches.winners`, retain/bundle consumers | Imported winners use existing Library reconciliation, exact audio hashes and portable download paths. Use the sound description as intent, not an invented generation prompt derived from video metadata. |
| `src/cli.ts`, `src/setup.ts`, readiness | Studio currently awaits Ollama startup. Make unavailable generation dependencies visible without blocking the import/review UI. Import and normal signal/edit setup must not download generation weights or require Metal/Ollama. |

## Embedded player and local service boundaries

Use one iframe inside the dialog, with fixed YouTube embed origin, validated video ID, native controls and an accessible title. Opening the first search result does not autoplay; an explicit Play here action may request playback. Unload the iframe on close/navigation and coordinate with the existing single-audio/trim-preview policy.

Studio currently sends `default-src 'none'` without `frame-src`, plus `Referrer-Policy: no-referrer`. Add a narrow YouTube `frame-src` allowance and the iframe's tested `strict-origin-when-cross-origin` referrer policy so the embed receives the required origin identification. Keep the rest of Studio's Host, Origin, session, CSRF, bearer and asset-path protections. No broad remote-script permission or Data API key is needed. Verify actual playback in Studio, not just iframe markup.

## Readiness, limits and recovery

The POC verified Node 22.22.3, yt-dlp 2026.08.19, EJS 0.8.0 and FFmpeg/ffprobe 9.0.1. Its system yt-dlp 2025.06.25 failed the runtime-option preflight; the isolated installation worked. Use that tested extractor/EJS pair as the initial pin, in a factory-owned runtime location. Do not depend on the POC server, its data folder, a global yt-dlp version or copied experimental clips.

Before import, verify the extractor/EJS/runtime, FFmpeg/ffprobe and writable/free storage. Missing import tools affect YouTube readiness, not existing generated takes. Keep tool setup separate from an accepted download job. Tool updates are checked outside active work and can roll back without touching saved audio.

Preserve the POC budgets: ten results per explicit search, 60-second search deadline, one acquisition at a time, ten-minute acquisition budget including bounded network retries, two-minute conversion budget and 256 MiB acquired-media limit. The 200 ms disk monitor permits a transient overshoot; enforce the final size before accepting media and do not describe it as an instantaneous filesystem quota. Reject unfinished/live, unavailable and invalid-duration sources. If section acquisition fails, allow a complete audio-only fallback only for a known source no longer than ten minutes within the same limits.

Persist acceptance before starting external work and retained-source/candidate completion immediately. Use atomic commits and stable operation/attempt IDs. A restart after candidate save but before batch completion must reconcile that candidate instead of creating another card. A restart earlier may resume verified local artifacts or retry the bounded read-only acquisition under the same operation. Do not replay an unrelated generation or paid call. Preserve existing generation/ElevenLabs recovery semantics.

Explicit cancellation stops only owned subprocesses and leaves saved takes/winners intact. Progress uses stage and elapsed time; silence is not a timeout. Surface access, rate-limit, missing-tool, extraction and invalid-audio errors separately. Cookie capture, proxy rotation, token-provider infrastructure, source separation and new audio effects remain outside this milestone.

## Delivery order

1. **Import contract and shared job path.** Add the source variant, sound ownership, one-take execution and initial full-interval delivery; verify through the existing candidate/cut/selection/export paths before UI wiring.
2. **Batch popup.** Integrate the proven search/player/interval controls with Studio auth, readiness and queue status. Hand completed imports into the normal take list and editor.
3. **Compatibility and recovery.** Verify mixed-provider numbering, generation drafts, Library/winners, cancel/refresh/restart, setup isolation and historical exports.
4. **Integrated browser verification and usage docs.** Demonstrate the exact owner workflow in Studio and document YouTube setup/error recovery. Keep the POC as the reference, not an ongoing runtime dependency.

## Acceptance

- [x] In a batch sound with five generated takes, YouTube opens the popup for that sound; real search and embedded playback work without a Data API key.
- [x] Choosing a URL and interval adds exactly one local audio take to that sound. Its original five takes and current selected winner remain unchanged.
- [x] The new card uses ordinary take numbering and a YouTube source label. A second import adds another take; trimming either import adds a version within that take.
- [x] Importing 120–125 seconds yields the full five-second source, including silence/events within those bounds. The normal Studio trim editor works in local 0–5-second coordinates and can play/adjust/save the expected samples.
- [x] Existing Level, fade/trim behavior and loop/crossfade preview/save work through the same editor/backend as generated audio. No POC editor or custom gain renderer is used in Studio.
- [x] “Use this take” on an imported version updates the existing selected-winner UI, Library and batch readiness. Winners/exports contain exactly the selected audio bytes and remain usable after restart and removal of temporary downloads.
- [x] Closing the dialog does not cancel accepted work; explicit Cancel does. Reopening/refresh reconnects. Completion after navigating elsewhere attaches to the original sound without stealing the current view.
- [x] Duplicate clicks, uncertain HTTP acceptance and restart around candidate commit do not create duplicate cards. Idempotency-key conflicts across inputs/sounds are rejected.
- [x] Import queue/pause behavior coexists with generation. Failed/canceled imports leave prior takes/winners usable and do not permanently block a completed batch's export.
- [x] Subsequent local/ElevenLabs generation uses the sound's generation prompt/duration/loop intent, with existing generation controls and paid-call semantics preserved.
- [x] Import/search and normal editing work without generator weights or an available Ollama service. Existing local/ElevenLabs workflows and historical candidate/export records still work.
- [x] Focused deterministic checks cover imported-source validation, interval/frame boundaries, one-take grouping, exact winner identity, auth, cancellation and commit recovery. Browser checks cover the actual popup → card → normal editor → selection → winners journey.
- [x] At least one real Studio import, including a later video interval, completes the integrated journey. Reuse the POC's three-video acquisition evidence while extractor inputs are unchanged; rerun affected acquisition checks if they change.

Evidence classification: the accepted POC and its [recorded checks](../../experiments/youtube-sounds/verification.md) establish feasibility and are inherited evidence. They do not prove batch integration. The integrated candidate/editor/selection/export journey and its recovery checks are mandatory. The owner has accepted the POC experience; do not introduce a new arbitrary five-sound human-review gate for shipping this integration. Human listening remains the normal product workflow for choosing useful sounds, not an automated claim of perfect quality.


## Integration evidence — 2026-09-13

The reviewed implementation uses `youtube.mjs`, the existing `workflow.mjs` job owner/candidate store, the batch queue, native Studio dialog, and existing cut/selection/Library/export paths. There is no second application server, clip store, metadata catalog, Data API, model/seed placeholder, or copied POC gain renderer. Acquisition preserves the selected interval and uses `renderTrim`/`quantizeLoop`; delivered versions use `qaOperation` with explicit full bounds. Imported records discriminate `runtime.backend: "youtube"` inside the legacy envelope, with empty model/license lists and no seed.

Verification used an isolated Studio workspace with five synthetic generated originals per sound and **real** YouTube search, playback and acquisition. It did not overwrite the user's existing library or selections. Studio remains available for review at **http://127.0.0.1:8767/#batch/5ce67a9e75047e16bbc1823623550348**. The generated originals are labelled as fixture data; human listening approval is not claimed.

| Acceptance coverage | Concrete evidence |
| --- | --- |
| 1: Five originals, per-sound popup, search and embedded playback | Real search returned ten results. The first iframe used `autoplay=0`. Actual embedded `CBDZg1Jb_T4` playback advanced from 20.849804 to 22.351847 seconds with `paused=false`, `readyState=4`. Recorded in `.test-artifacts/youtube-studio-player-evidence.json`. |
| 2–3: One extra take, numbering, preserved originals/winner, versions | Two explicit real imports of `CBDZg1Jb_T4`, each 120–125 s, became Clip 6 and Clip 7 under the original rain sound. The original five candidate identities remained available. Trimming Clip 6 and saving a loop of Clip 7 kept their attempt identities and did not create Clip 8 or change the winner. |
| 4: Full interval and local editor coordinates | Each retained source is 220,500 stereo frames / 5.000 s at 44.1 kHz PCM16. Initial cut bounds are 0–220,500. The normal editor's keyboard handles set local bounds 1–3 s and saved exactly 88,200 frames. Deterministic source checks also preserve leading/trailing silence and check actual marker samples, fractional intervals, a single-frame interval and truncated coverage rejection. |
| 5: Shared Level, fades and loop editing | The live normal editor saved the 1–3 s version at −6 dB. Its normal loop controls previewed repeating processed audio and saved Clip 7 as a 4.750 s loop with 0.250 s crossfade. `loop-audio.test.mjs`, `qa.test.mjs` and the integration test verify shared renderer samples, fades, level/limiting and loop frame evidence. |
| 6: Exact winner, Library, portable export and restart | Selected candidate `1eb04aa29adeed84ffec8029eeba1ce4dfd23a0087c056074b24e02c4a6f8f13` has delivered SHA-256 `1ef4faa89f5f1cee08c2dc5fb011afa0b490a77554a11660e0547ad3b8e49204` (2.000 s). Winner UI, Library, winners manifest and downloaded WAV agree. The downloaded tar independently passes `verifyExport` after extraction. The same winner survives Studio restarts, the second import, loop-version saving and deletion of the isolated workspace's temporary `out/` runs. No acquisition directories remain. |
| 7: Close, cancel, reopen/refresh, navigation and focus | `scripts/studio-youtube-browser-check.mjs` passed lost-response recovery, queued and active cancellation, reopening/refreshing with original inputs, completion while the other sound's popup stays open, no view stealing, unchanged prompt/duration/loop drafts, Escape/focus return, iframe unload and 390 px mobile layout. The fixture uses delayed acquisition so each lifecycle condition is observable. |
| 8: Acceptance identity and commit recovery | `youtube-integration.test.mjs` checks concurrent duplicate submissions, conflicting intervals/sounds and hard process exits immediately after source and delivered-candidate commits. Recovery produces one take under the same attempt and does not acquire again. `youtube.test.mjs` checks a real owned subprocess surviving its parent crash, then being stopped through its recorded identity before recovery. |
| 9: Shared queue, pause and terminal states | Integration checks hold an import behind an active generation, then release it without interrupting generation. Paused imports do not start; queued cancellation creates no audio. Acquisition failure and active cancellation preserve ready winners. A delivery failure resumes from the retained source. |
| 10: Subsequent generation intent and paid semantics | Integration checks preserve a ten-second looping generation request across a non-loop import, then verify subsequent local and ElevenLabs requests keep the original prompt/duration/loop intent. Existing ElevenLabs tests still pass; verification does not place paid calls. |
| 11: Dependency isolation and historical compatibility | Imports bypass prompt planning, backend execution, seeds and replacement generation. Tests assert setup receives `generation=false` and acquisition waits for the ordinary generation owner. Search/acquisition require only the pinned extractor/EJS, Node and FFmpeg tools. CLI starts Studio before background Ollama startup and exposes planner availability separately. Existing standalone, local, ElevenLabs, retained-store and historical export checks pass without record migration. |
| 12: Deterministic and browser coverage | `pnpm build` and `pnpm test:audio-factory` pass: **57 Node tests and 2 Python tests**. After the final frontend-only adjustments, `node --test studio-frontend.test.mjs studio-sound-grouping.test.mjs` passes all **9** checks. Actual UI journey and lifecycle checks are recorded separately from synthetic backend evidence. |
| 13: Real integrated late interval; inherited acquisition evidence | Both real late-interval imports completed through Studio's popup and ordinary take/editor workflow. The accepted POC's three-video acquisition evidence remains inherited: extractor/EJS versions and search/section/fallback arguments are unchanged. Changed decoding/normalization was reverified with deterministic sample checks and these real Studio imports. |

Canonical local verification artifacts are `.test-artifacts/youtube-final-suite.log`, `youtube-final-frontend.log`, `youtube-browser-lifecycle.json`, `youtube-browser-lifecycle.log`, `youtube-final-live-evidence.json`, `youtube-studio-player-evidence.json`, `youtube-winner-rain.tar` and `youtube-studio-loop.png`. They are ignored test artifacts, not product source metadata. The durable review workspace is `.runtime/studio-youtube-L7r39E`.

Reproduce deterministic verification with `pnpm test:audio-factory`. For browser lifecycle checks, start a fresh `STUDIO_YOUTUBE_PORT=8769 node scripts/studio-youtube-fixture.mjs --offline`, then run `node scripts/studio-youtube-browser-check.mjs`. For a real review workspace, use `node scripts/studio-youtube-fixture.mjs`; generation is synthetic in this explicitly labelled fixture, while search/import/edit/export use the integrated production paths. Normal Studio remains `pnpm audio:factory studio`. Setup and recovery instructions are in [Studio usage](../studio.md#add-a-youtube-take) and the [agent API](../agent-api.md#youtube-intervals-in-an-existing-batch-sound).

### Limits and review notes

- No human listening approval, usefulness judgment or perfect-quality claim is made. The owner accepted the POC experience; no additional human-review shipping gate was introduced.
- YouTube access and extraction can change. Private/live/unavailable sources and rate limits produce explicit errors; cookies, proxies and token-provider infrastructure remain outside scope.
- The 200 ms disk monitor permits transient overshoot; final acquired-media size is checked. Section seeking is not a promise of sample-exact alignment with YouTube's player timeline. The durable local source and all later versions have exact frame/hash checks.
- The generation originals in the live review fixture are synthetic. Actual YouTube playback/download and the normal editor/Library/export journey are real. Existing provider behavior is covered by deterministic regression checks, without paid verification calls.
- Two bounded DeepSeek workers were attempted in isolated copies (acquisition and popup). Both exited without output or file changes. The main agent implemented and reviewed all delivered changes and performed the verification.
