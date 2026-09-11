# Loop-generation acceptance audit

11 September 2026. Implementation and all seven acceptance items are verified. The user approved all three auditioned loops: “Approved all 3 loops,” and confirmed “All three sound natural.”

| Plan item | Current evidence | Status |
| --- | --- | --- |
| 1. Boolean, non-loop compatibility, persistence and idempotency | `service.test.mjs`, `batches.test.mjs`, `studio-sound-grouping.test.mjs`, `prompt-plan.test.mjs`: default/false identities, true conflicts, concurrent queue edits, explicit false, inheritance and restart. CLI and Studio use the shared workflow. Browser confirms draft persistence. | Verified by the passing suite and browser check. |
| 2. Native provider behavior | `elevenlabs.test.mjs`: mocked flag, codec-decoded frame count, no requested-duration padding, native global-gain preparation, explicit repair/off, receipt reattachment and no additional call on restart. | Verified with a mock; no paid request needed. |
| 3. Edge bounds and unsuitable inputs | `loop-audio.test.mjs`: sustained ramps, unshortened constant ambience, interior quiet, silence, invalid bounds and too-short source. Original buffers remain unchanged. | Verified mechanically and accepted through the listening review in item 5. |
| 4. Sample construction | `loop-audio.test.mjs` and `qa.test.mjs`: noise, tone, transients, silence, stereo alignment, N−F frames, natural adjacent wrap frames, crossfade ends/interior, finite samples, ceiling, full PCM equality between preview and saved audio. | Verified. |
| 5. Rain/forest/shoreline audition | Three-cycle files and originals in `.test-artifacts/loop-listening-q3UHrS/`. Every original hash was rechecked against the live source; every loop matches the current renderer; each three-cycle file contains exactly three copies of its loop PCM. Durations: 16.6, 18.95 and 19.5 seconds. | **Approved by the user:** “Approved all 3 loops.” Approval is recorded against the unchanged rain, forest and shoreline WAV hashes in `evidence.json`. |
| 6. Preview, save, reload and exact export | Isolated browser fixture: native Web Audio looping for 9.497 seconds on a 2.5-second buffer, zero preview POSTs; one save POST added one version and did not select it. Actual browser buffer matched every saved sample. Explicit fixture selection survived reload. A subsequent isolated Studio restart and archive GET verified the exact WAV hash, candidate ID, 110250 frames and unchanged selection history inside the archive. Server closed afterward. | Verified. |
| 7. Preserve existing state; isolate verification | Runtime tests use temporary roots and mocked providers. Audition preparation writes only fresh `.test-artifacts` files; all three real source hashes still match. No production batch, winner, history or provider receipt was changed by this work. Test servers/browser sessions closed. | Verified for performed actions. |

The inherited full-suite result remains applicable: `pnpm build` succeeded; `pnpm test:audio-factory` passed 46 JavaScript tests and 2 Python tests (`.test-artifacts/loop-suite.log`). The final audit changed documentation only. No redundant full-suite rerun or live paid generation is required.

Complete. The listening approval accepts the current processing defaults for these three audition tracks. No further tuning was requested; production winners and batches remain unchanged.
