# Waveform trim control

Requested 11 September 2026. **Design specification only; not implemented.**

## Outcome

Replace the separate Start and End slider rows and **Replay selection** controls with one integrated waveform cutting element. The user's supplied reference shows the intended arrangement: audio amplitude across a horizontal timeline, two prominent selection handles, and a vertical playback cursor.

The control must show all four things together:

- **Start handle:** draggable left selection boundary.
- **End handle:** draggable right selection boundary.
- **Audio levels:** a waveform covering the full original recording.
- **Playing position:** a vertical line moving across that same waveform.

Both handles share one timeline. The selected interval is highlighted; excluded audio remains visible but dimmed. Use clear handles and a distinct playhead so playback cannot be mistaken for a trim boundary. Match Studio's styling; the reference establishes the interaction, not a requirement to copy its colors.

## Layout and interaction

Place a single **Play / Pause** toggle beside or immediately below the waveform. Remove **Replay selection** and the separate **Pause** button from the trim editor. The toggle label and icon reflect actual playback state.

Show Start, End, and selected duration in seconds below the timeline. These values update while dragging. Keep **Save trim** as the explicit action that creates a saved version.

- Initially, the playhead rests at the selected start. Play begins there.
- While playing, the playhead follows the audio's actual playback time from left to right. It is not an independent timed animation.
- Pause holds the current position. Play resumes from that position when it remains inside the selection.
- At the selected end, stop playback and leave the line at the end. The next Play starts from the selected start. Ordinary trim playback does not repeat automatically.
- Clicking or tapping the waveform inside the selection seeks the playhead. Seeking while playing continues playback; seeking while paused stays paused. Outside-selection clicks clamp to the nearest selected boundary.
- Dragging either handle pauses playback, updates the bounds, and returns the playhead to the new selected start. Pointer movement on a handle must not also trigger seeking.
- Handles cannot cross or leave the recording. Maintain a nonempty interval using the existing supported trim precision. Support mouse and touch, including narrow selections where handles are close together.
- Starting this preview stops any other Studio audio. Closing the editor stops its preview and releases its animation work.

Provide keyboard-focusable Start and End sliders with accessible names, current time values, and visible focus. Arrow keys adjust bounds using the existing 0.01-second step. Play/Pause must be keyboard operable. Do not announce every animation frame to assistive technology.

## Waveform and playback

The waveform represents amplitude over time, not a decorative placeholder or a separate live volume meter. Decode the original audio used by the existing trim preview and derive peak ranges for horizontal display buckets. Preserve short peaks; do not use signed averages that can cancel the signal. For stereo, retain the strongest channel peaks when drawing a combined overview.

Keep one amplitude scale across the clip so quiet edges remain visibly quieter. The full recording stays mapped to the same horizontal axis while handles move. Resizing redraws the waveform without changing times or bounds.

Use the existing browser audio player as the playback clock and a lightweight canvas or SVG waveform. Cache waveform data for the open source and avoid decoding again on each drag or background refresh. No new waveform framework is required for this scope.

Show a loading state until the waveform is ready. If decoding or audio loading fails, show a nearby actionable error; retain draft bounds and saved work. Do not display invented levels or a moving cursor when playback failed.

## Existing behavior to preserve

The current implementation is in `studio.js`, function `trim()`. It already previews original-source bounds, persists draft times, enforces one active player, and saves through the existing cut endpoint. Reuse those paths.

This change is an editing interface change. Ordinary preview still plays the original interval; saved trim processing still adds the existing fades and normalization. Keep that distinction visible in the existing short helper text. Saving creates an immutable version and does not select a winner automatically. No API contract change is needed for this interface alone.

Background refresh must preserve the open editor, draft bounds, playback, and playhead. Existing saved bounds must reopen at their correct positions on the original-source timeline.

## Relationship to loop generation

The [loop-generation proposal](../loop-generation/plan.md) remains separate. Its future processed-loop audition must show playback position on the processed loop's timeline, because rotation and crossfading change sample order and duration. Do not put that playback cursor on the original waveform as if the timelines were identical. This trim-control change does not implement loop processing or automatic repetition.

## Acceptance checks

1. A real clip displays its waveform with both handles on one line; dragging either updates the highlighted region and time readouts without crossing bounds.
2. Play/Pause and seeking keep the line synchronized with audible playback. End-of-selection playback stops correctly; the next Play restarts at Start.
3. Handle dragging, keyboard adjustment, touch interaction, and resizing preserve accurate bounds and predictable playback behavior.
4. Only one clip plays at a time. Closing the editor and failed playback leave no moving cursor or active preview behind.
5. Refresh preserves drafts and playback. Save trim sends the selected bounds through the existing endpoint and retains exact-version download and explicit winner selection behavior.

Verify with an isolated Studio fixture and real audio containing both quiet and loud passages. Do not alter the user's review batch to test the interface.
