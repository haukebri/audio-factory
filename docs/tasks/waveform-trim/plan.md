# Waveform trim control

Requested 11 September 2026. **Implemented and verified.** See [acceptance evidence](acceptance.md).

## Outcome

Replace the separate Start and End slider rows and **Replay selection** controls with one integrated waveform cutting element. The user's supplied reference shows the intended arrangement: audio amplitude across a horizontal timeline, two prominent selection handles, and a vertical playback cursor.

The control must show all four things together:

- **Start handle:** draggable left selection boundary.
- **End handle:** draggable right selection boundary.
- **Audio levels:** a waveform covering the full original recording.
- **Playing position:** a vertical line moving across that same waveform.

Both handles share one timeline. The selected interval is highlighted; excluded audio remains visible but dimmed. Use clear handles and a distinct playhead so playback cannot be mistaken for a trim boundary. Match Studio's styling; the reference establishes the interaction, not a requirement to copy its colors.

## Layout and interaction

Place a single **Play / Pause** toggle beside or immediately below the waveform for original-source playback. Remove **Replay selection** and the shared standalone **Pause** button from the trim editor. The toggle label and icon reflect the original audio player's actual playback state, including pauses caused by another Studio player. Preserve a stop action for processed-loop audition as described below.

Show Start, End, and selected duration in seconds below the timeline. These values update while dragging. Keep **Save trim** as the explicit action that creates a saved version.

- Initially, the playhead rests at the selected start. Play begins there.
- While playing, the playhead follows the audio's actual playback time from left to right. It is not an independent timed animation.
- Pause holds the current position. Play resumes from that position when it remains inside the selection.
- At the selected end, stop playback and leave the line at the end. The next Play starts from the selected start. Ordinary trim playback does not repeat automatically.
- Clicking or tapping the waveform inside the selection seeks the playhead. Seeking while playing continues playback; seeking while paused stays paused. Outside-selection clicks clamp to the nearest selected boundary.
- Dragging either handle pauses playback, updates the bounds, and returns the playhead to the new selected start. Pointer movement on a handle must not also trigger seeking.
- Handles cannot cross or leave the recording. Clamp the moved handle rather than swapping handles or moving the opposite boundary. Use the existing 0.01-second adjustment step and a minimum interval of 0.01 seconds (or the entire recording when shorter). Preserve exact saved sample-derived bounds until the user adjusts them; displaying two decimal places must not round the stored bounds on opening or saving an unchanged editor.
- Support mouse and touch, including narrow selections where handles are close together. Give each handle a generous hit target and a distinct grip above/below the timeline so both remain reachable when their horizontal hit areas overlap. Capture the active pointer until release or cancellation; either event retains the latest valid bounds and leaves playback paused at Start.
- Starting this preview stops any other Studio audio. Closing the editor stops its preview and releases its animation work.

Provide keyboard-focusable Start and End sliders with accessible names, current time values in seconds, valid minimum/maximum values, and visible focus. Arrow keys adjust bounds using the existing 0.01-second step and the same pause/reset behavior as dragging. Play/Pause must be keyboard operable. Do not announce every animation frame to assistive technology; the playhead and waveform drawing are visual, while slider values and ordinary text readouts expose the selection.

## Waveform and playback

The waveform represents amplitude over time, not a decorative placeholder or a separate live volume meter. Decode the original audio used by the existing trim preview and derive peak ranges for horizontal display buckets. Preserve short peaks; do not use signed averages that can cancel the signal. For stereo, retain the strongest channel peaks when drawing a combined overview.

Keep one amplitude scale across the clip so quiet edges remain visibly quieter. The full recording stays mapped to the same horizontal axis while handles move. Resizing redraws the waveform without changing times or bounds.

Use the existing browser audio player as the playback clock and a lightweight canvas or SVG waveform. Cache waveform data for the open source and avoid decoding again on each drag or background refresh. No new waveform framework is required for this scope.

Show a loading state until the waveform is ready. Disable original-source Play until the waveform and audio metadata are ready. If decoding or audio loading fails, stop playback and show a nearby error with a **Retry audio** action that reloads the source without replacing the editor or its draft. A rejected Play attempt returns the toggle to Play and explains how to retry. Retain draft bounds and saved work; saving valid bounds does not depend on waveform decoding succeeding. Do not display invented levels or a moving cursor when playback failed.

Closing the editor cancels its pending source fetch where possible, disconnects resize observation, and cancels animation work. Discard late decode/play results after closure or source replacement so they cannot revive playback or update another editor. A retry replaces only failed load state; ordinary refresh and handle movement reuse the open source's decoded data.

## Existing behavior to preserve

The current implementation is in `studio.js`, function `trim()`. It already previews original-source bounds, persists draft times, enforces one active player, and saves through the existing cut endpoint. Reuse those paths.

This change is an editing interface change. Ordinary preview still plays the original interval; saved trim processing still adds the existing fades and normalization. Keep that distinction visible in the existing short helper text. Saving creates an immutable version and does not select a winner automatically. No API contract change is needed for this interface alone.

Background refresh must preserve the open editor, draft bounds, playback, and playhead. Existing saved bounds must reopen at their correct positions on the original-source timeline.

## Relationship to loop generation

The [loop-generation work](../loop-generation/plan.md) is already implemented and [accepted](../loop-generation/acceptance.md). Preserve its Loop checkbox, Crossfade, curve, native-loop preservation, processed audition and Save loop behavior. The waveform edits original-source bounds in either mode; original-source Play never repeats, even when Loop is checked.

Replace **Preview loop** with a **Preview loop / Stop loop** toggle for the existing processed audition. It remains separate from original-source Play/Pause and reflects loading, playing and stopped states. Starting either preview stops the other. Handle or keyboard bound changes, loop-setting changes, another Studio player and editor closure stop processed audition, including one still loading.

During processed audition, keep the original waveform's playhead stationary and label the activity as **Processed loop preview · repeating** with its actual output duration. Do not put a moving processed-playback cursor on the original waveform: rotation and crossfading change sample order and duration. A future processed-loop waveform must use its own timeline; adding that visualization is outside this change. Retain helper text explaining that original Play auditions the original interval, ordinary Save trim adds the existing fades and normalization, and Preview loop auditions the proposed processed loop.

## Acceptance checks

1. A real clip displays its waveform with both handles on one line; dragging either updates the highlighted region and time readouts without crossing bounds.
2. Play/Pause and seeking keep the line synchronized with audible playback. End-of-selection playback stops correctly; the next Play restarts at Start.
3. Handle dragging, keyboard adjustment, touch interaction, and resizing preserve accurate bounds and predictable playback behavior.
4. Only one clip plays at a time. Closing the editor and failed playback leave no moving cursor or active preview behind.
5. Refresh preserves drafts and playback. Save trim sends the selected bounds through the existing endpoint and retains exact-version download and explicit winner selection behavior.
6. Existing loop editing and saving remain functional. Preview loop can be stopped from its toggle, never animates the original-source playhead, and cannot restart after bounds change or editor closure during loading. Switching preview modes leaves only one active audio source.

Verify with an isolated Studio fixture and real audio containing both quiet and loud passages. Do not alter the user's review batch to test the interface.

## Verification evidence required for implementation

Use `scripts/studio-ui-fixture.mjs` in an owned `.runtime/studio-ui-*` root with mocked providers. Preflight the browser, fixture readiness and source availability before interactions; do not use a live review session or spend provider credits. Use a decoded stereo clip with quiet edges, louder interior passages and short peaks in each channel. Include silence to confirm no invented amplitude. Record the source identity and fixture root with the results.

- **Waveform:** inspect wide and narrow layouts, verify short peaks from either channel survive bucketing, and compare quiet/loud regions under one scale. Resize while paused and playing; source times and bounds must stay unchanged.
- **Interaction:** exercise mouse drag, touch drag, overlapping handles, pointer cancellation and keyboard arrows. Verify clamping, the minimum interval, readouts, focus and exact saved-bound reopening. Handle gestures must cause no seek beyond the reset to Start.
- **Playback:** compare playhead position with `audio.currentTime` while playing, paused, seeking and at the selected end. Verify resume, restart, one-player enforcement, loop-mode switching and closure. Observe actual browser audio state; a screenshot alone does not prove synchronization or silence.
- **Recovery:** fail source fetch/decode and reject Play, then retry. Close during loading and during playback. Verify retained drafts, no late playback, no active animation after closure, and no repeated decode across unchanged background refreshes.
- **Persistence:** refresh during playback and dragging; retain the editor and source player. Capture the save request and verify selected original-source bounds, one immutable new version, no automatic winner selection, and exact-version download. Repeat the loop save path to protect existing behavior.

These checks are mandatory for implementation acceptance. Reuse unchanged backend cut/export evidence where applicable; UI behavior needs fresh browser evidence. The completed checks and reproduction commands are recorded in [acceptance.md](acceptance.md).
