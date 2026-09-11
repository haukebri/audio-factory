# Batch review UX changes

Reviewed 11 September 2026 by the main agent and three independent agents covering navigation/selection, trimming/playback, and button/ElevenLabs feedback. This is an implementation plan, not implemented UI changes.

## Evidence

Read-only browser review used batch `0d7ca0a9ee329fab21c20d4ba2ec34be`. It showed ten variation cards, repeated variation numbers, and a separate expanded “Take 7” editor. The chosen trimmed clip still said “Human: Unreviewed.” The completed batch offered both Pause and “Next sound needing a choice.” No winners were changed, generation requested, or paid calls made during this review.

Code explains the behavior:

- `studio.js:59` plays a card without updating the separate editor; `:282` selects a winner without updating that editor; `:359` opens an editor automatically when choosing a sound. Playback, editing, and winner state are disconnected visually.
- `studio.js:20–33` queues even local button actions behind asynchronous work without updating the clicked control. Feedback is mostly in the page-top status line.
- `studio.js:151–159` provides numeric trim inputs and saving, but no draft playback. `:172` calls `play()` without seeking, so “Play take” resumes rather than replays.
- `studio.js:146–179` presents Approve, Reject, Use this take, and Compare together. Two independent decision systems compete for attention.
- `studio.js:271–280` and `:340–357` submit ElevenLabs requests, but queued batch operations have no variation card until a job has variants. `batches.mjs:129–136` uses the selected candidate's prompt and requested duration: this creates a new rendition from text, not an audio-conditioned recreation of the selected clip.

## Default flow and layout

**Open batch → choose sound → listen → optionally trim and replay → select winner → next sound → export winners.**

Use one consistent layout across batch review and standalone sounds. Retain the current visual theme and native controls. No new UI framework or waveform editor is needed.

1. Compact batch header: name, selection progress, and Export winners when ready. Queue controls appear only while relevant.
2. Visible sound list with readable names and Selected / Needs selection / Generating / Failed states. Use a native sound dropdown on narrow screens. Keep a clear current-sound heading.
3. Compact clip rows: identity, duration, player, **Replay**, **Use this take**, **Trim**. Show a persistent Selected badge on the winner. Put the selected winner first, including a selected saved trim; default to the latest generation and collapse older generations under “Earlier clips.”
4. Sound-level secondary actions: **Generate more** and **Edit prompt**. Clip-level **Generate with ElevenLabs** and **Download** belong in secondary actions. Avoid repeating sound-level generation controls on every clip.
5. Expand trimming directly beneath its clip. Only one editor is open; remove the detached, always-visible `#candidate` presentation.

Use a stable identity everywhere, for example **City street ambience · Clip 7 · Local · 27.0 s**, with **Trim 1.00–28.00 s** where applicable. Number clips consistently within a sound, including later generations; do not renumber when sorting. Full prompts, attempt numbers, hashes, and generation settings are secondary details, not headings.

### Group repeated generations

Each generation request gets a visible group within its sound: **Generation 1 · Local · 5 clips**, **Generation 2 · Local · 5 clips**, or **Generation 3 · ElevenLabs · 1 clip**. Use the existing job/operation identity to group clips; do not create another grouping model. Show the newest group first with a **Latest** label and collapse older groups under their generation headings, marked **Earlier generation**. Keep numbering stable across requests: clips 1–5, then 6–10, rather than another indistinguishable 1–5.

If a winner belongs to an older group, keep its playable selected row visible above the groups and label that group's heading **Contains selected winner**. Generating again never marks the old clips rejected or replaces the winner. All earlier clips remain available for replay and selection. A pending request appears immediately as its generation group with Queued/Generating status; completed clips fill that same group rather than appearing as an unrelated appended set.

Acceptance: generate twice for the same sound, then reload. Two clearly labeled groups retain their identities and clip numbers; the newest is expanded, older work is marked and collapsed by default, and a winner from the first group remains visible and selected. Manual expansion choices survive background refresh.

## Required tweaks

| Priority | Change | Behavior |
| --- | --- | --- |
| P0 | One winner decision | Remove Approve/Reject from the normal flow. Use this take is the sole primary choice. Preserve historical review data without requiring new review events. Library filters become All / Selected / Needs selection. |
| P0 | Visible button outcomes | Show immediate pressed/focus feedback. Async actions show Selecting…, Saving…, or Queueing… at the clicked control; then a persistent result or adjacent actionable error. Prevent duplicate submissions while pending. |
| P0 | Consistent selection | On confirmed save, every representation of the clip shows Selected, the previous winner loses its badge, and progress updates. Keep the user on the clip; provide Next sound explicitly. Failed saves retain the previous winner. |
| P0 | Correct editor identity | Open only from Trim on a clip. Bind player, bounds, title, save, and download to that exact clip. Close the editor and stop its preview on sound changes. Playing a different clip closes the old editor while retaining its draft. Never let refresh silently switch the editor. |
| P0 | Preview without saving | Two labeled native range sliders, Start and End, with seconds readouts, optional numeric entry, and resulting duration. Replay selection starts at Start and stops at End; Pause stops it. Slider changes and preview never create a version or change a winner. |
| P0 | Clear ElevenLabs flow | Label Generate with ElevenLabs and explain briefly that it makes a new rendition from the prompt. Show Queueing → Queued → Generating → Ready/Failed on a placeholder row immediately after acceptance. Keep the current clip and winner unchanged. On completion, offer Replay and Use this take. |
| P1 | Remove comparison | Remove Compare and Compare versions, dedicated comparison markup, handlers, styling, and stale navigation state. Old comparison links return to the sound view. Listening to adjacent clips covers the normal comparison task. |
| P1 | Hide technical and legacy UI | Remove the blind toggle and everything technical below Trim from normal review. Put signal checks, evidence snapshots, raw job data, and historical review information in Settings → Diagnostics. Preserve existing export evidence. |
| P1 | Meaningful completion | Hide Pause when no queued/running work exists. When every sound has a winner, replace Next needing a choice with All sounds selected and the export action. No button should merely reopen the same completed sound. |

## General interaction rules

- Local playback, slider movement, disclosure, and navigation respond immediately; they must not wait behind the global network action queue. Keep existing durable request keys and recovery behavior for mutations.
- One click submits one operation. Repeated clicks while pending do not create extra generations, selection events, or exports. Do not introduce a new state framework to accomplish this.
- Show short errors beside the action, retain full diagnostics in saved records, and retain safe retry behavior. Do not replace useful user-facing validation with a generic failure.
- Announce operation results through a nearby live status region. Do not rely on color, a temporary toast, or a message several screens away. Retain visible keyboard focus and adequately sized controls.
- A disabled action explains why: missing ElevenLabs configuration, duration above 30 seconds, or an equivalent request already pending. Configuration readiness already exists; use it at the action rather than only in Settings.
- Queue status belongs to the chosen sound. Activity on another sound may appear in a small global indicator, but must not replace the chosen sound's progress or editor.
- Background refresh preserves playback, focus, open disclosures, and draft trim bounds. New results appear as new rows, without navigation or automatic winner changes.

## Trim defaults and save semantics

Reuse the existing original-audio `/source` endpoint, which supports seeking. All slider coordinates are seconds in that original, including when editing a saved trim. Default to the current saved bounds, or the full original when no trim exists. Clamp values to the source duration and require Start < End. Use a 0.01-second slider step with readable decimal values and keyboard support.

Replay always seeks to the draft start, even when paused halfway through. Only one clip plays at a time. Source loading and playback failures appear beside Replay. Draft preview is the selected source region; the saved version additionally receives the existing fades and normalization. Say this briefly beside Save trim rather than implying preview is the final processed waveform.

**Save trim** persists one new version, opens that saved version in the same row, and confirms “Trim saved.” It does not silently replace the winner. The user chooses Use this take to make that exact saved trim the winner. Download exports the saved version, never silently substitutes an unsaved draft.

## Implementation order and verification

1. Simplify clip identity/layout and remove competing review/comparison controls.
2. Bind the inline editor to its clip and add local trim sliders/replay.
3. Apply the shared button feedback convention, winner state, and ElevenLabs queue rows.
4. Finish sound navigation, completion state, and diagnostics placement.

Verify against an isolated Studio fixture so review tests cannot change the user's winners or spend generation credits:

- Open a multi-sound batch, play different clips, change sounds, and refresh: no stale editor, unexpected playback, or winner change.
- Move both sliders and replay repeatedly: correct source interval, immediate restart, and zero cut/select POSTs until explicitly saving/selecting.
- Save trim, select it, reload, and export: the exact saved version remains the winner and download matches it.
- Slow a selection request and double-click: one save, immediate pending feedback, persistent Selected state after success; previous winner remains after failure.
- Queue ElevenLabs behind another sound: visible pending row, no duplicate submission, correct sound-specific progress, and a playable new result. Missing key and excessive duration have visible explanations.
- Complete the last sound: accurate progress, no pointless next/pause controls, and clear export action.
- Check keyboard operation and a narrow viewport. No Compare, Approve/Reject, raw error payloads, or technical evidence in the normal review path.

Backend generation, immutable audio, saved selections, exports, and idempotency remain the existing mechanisms. This work primarily simplifies presentation and local interaction; no new approval model or batch engine is needed.
