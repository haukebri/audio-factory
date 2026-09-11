# Waveform trim acceptance

Implemented and verified on 11 September 2026. The control uses the existing original-source PCM decoder, browser audio clock, draft storage and cut endpoint. No dependency or API contract was added.

| Requirement | Current evidence |
| --- | --- |
| Waveform, selection and handles | Real stereo PCM fixture contains silence, quiet/loud passages and separate positive/negative channel transients. Browser canvas pixel checks verify silence, relative levels and preservation of both short peaks. Visual inspection at 375 and 1280 pixels confirms the common timeline, dimmed exclusions, distinct cursor and handles. |
| Play/Pause, seek and selection end | Browser checks compare the cursor against `audio.currentTime`, exercise paused/playing seeks and boundary clamping, then verify stopping at End and restarting at Start. A regression check covers a queued pause event arriving after a new Play request. |
| Mouse, keyboard, touch and resize | Actual browser mouse drag and Chromium touch input verify capture, cancellation, overlapping grips and a 0.01-second interval. Keyboard ArrowRight changes Start by 0.01 seconds with visible focus; both boundaries clamp correctly. Resize preserves times and bounds. |
| Exclusive playback, recovery and cleanup | Another audio player, processed loop audition and original Play stop each other. Decode failure, media-load failure and rejected Play recover through their controls. Closing during playback cancels all tracked animation callbacks; closing during a pending source/loop load leaves no player or loop running after completion. |
| Refresh, save and exact versions | Refresh during drag/playback preserves the editor/player; the open source is fetched once across adjustments, refresh and resize. Save sends the selected bounds, creates one immutable version and leaves winners unchanged. Exact-version export succeeds. Reopening and re-saving bounds at samples 1234 and 100003 preserves their exact values rather than rounding to the displayed hundredths. |
| Existing loop behavior | Preview/Stop loop, original/processed mode switching, bound-change cancellation and Save loop pass. Processed playback leaves the original cursor stationary, shows its own duration and repeats through the existing renderer. Saving a loop leaves winner selection unchanged. Backend processing/export behavior remains covered by the existing tests. |

## Reproduce

Start an owned fixture (use a new absolute root for a clean run):

```sh
node scripts/studio-ui-fixture.mjs "$PWD/.runtime/studio-ui-waveform-check" 0 --waveform
```

After it prints its readiness manifest, run:

```sh
node scripts/studio-waveform-browser-check.mjs
```

The check preflights fixture readiness and candidate provenance. It creates trim/loop versions only in that isolated root and closes its browser. Stop the fixture server after verification. Reusing the fixture is safe for user data, but each successful check intentionally adds fixture versions.

## Recorded results

- Browser: `.test-artifacts/waveform-trim-results.json`, with fixture root and source candidate identity. All listed checks passed on the final implementation.
- Visuals inspected: `.test-artifacts/waveform-trim-375.png`, `waveform-trim-1280.png` and `waveform-trim-narrow.png` in the same directory.
- `pnpm build`: passed.
- `pnpm test:audio-factory`: 46 JavaScript tests and 2 Python tests passed; `.test-artifacts/waveform-trim-suite.log`.
- After the final media-event race fix and loop cancellation error handling change, `node --test studio-frontend.test.mjs loop-audio.test.mjs` passed all 10 checks (`.test-artifacts/waveform-trim-final-tests.log`), and the complete browser check passed again. The broader unchanged backend evidence is inherited from the full-suite run.
- `git diff --check`: passed.

No user's review batch, source audio, winner or provider-credit state was changed. Fixture servers and task-owned browser sessions were closed after verification. This is interface/playback verification, not a new assessment of loop-processing sound quality; that separate work was already accepted.
