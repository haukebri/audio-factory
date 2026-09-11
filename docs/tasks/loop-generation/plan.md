# Loop generation and loop-aware cutting

Research and proposal: 11 September 2026. **Implementation complete; all three audition loops approved by the user.** Existing batches, audio and winners are unchanged.

## Requested outcome

Add a **Loop** setting to generation in both the API and Studio. A checked setting requests a continuous, repeatable sound and selects a separate loop-processing path instead of the current first-active-region cut with start/end fades. Initial focus: ambient rain, forest and shoreline sounds.

The user's suggested technique is to remove unsuitable fading edges, move a section from the end to the beginning, and feather the relocated join. Keep that principle, with an overlapping crossfade whose length suits the recording rather than a fixed one-millisecond edit.

## Research findings and recommendation

There is no universally best loop treatment for every recording. For this project, use provider-native looping when available, and deterministic rotation/crossfading for local generated ambience. Prompting helps the source remain continuous; it does not establish that the final waveform loops cleanly.

- **Native generation:** ElevenLabs exposes `loop: true` for `eleven_text_to_sound_v2`, with a 0.5–30-second generation range. Our client already uses that model but hard-codes `loop: false`. Enable the native flag when requested, then preserve and inspect the resulting loop rather than automatically cutting and fading it like a one-shot. [ElevenLabs API reference](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
- **Local generation:** Stability's current guide covers prompting, editing and inpainting, but does not document a loop switch for our integration. Our local request/backend path has none. Request sustained ambience with consistent texture and no intro/outro, while retaining deterministic post-processing as the actual loop construction. Do not assume prompting alone or a feature in another Stability product guarantees a seamless local result. [Stable Audio 3 prompt guide](https://stability.ai/guides/stable-audio-3-prompt-guide)
- **Overlap matters:** Crossfading blends two overlapping signals, unlike independently fading an end to silence and a beginning up from silence. Audacity documents its use for loops and warns that linear fades can produce a level dip; fade duration depends on the material. [Creating a crossfade](https://manual.audacityteam.org/man/creating_a_crossfade.html)
- **Curve choice matters:** Equal-power curves suit relatively uncorrelated material such as diffuse ambience. Closely correlated or tonal material can instead get louder or exhibit phase interference; audition an equal-gain curve or choose another overlap in those cases. A constant-power formula is not a universal loudness guarantee. [Fade and crossfade](https://manual.audacityteam.org/man/fade_and_crossfade.html)
- **Join inspection and listening matter:** Samplers expose loop length/crossfade controls and a view of the end-to-start transition. Audacity recommends careful loop-point positioning and lossless exports. A low-click boundary does not prove that a bird call, wave rhythm or background texture repeats naturally. [Kontakt loop editing](https://docs.native-instruments.com/ni-tech-manuals/kontakt-manual/en/classic-view), [Audacity loop guidance](https://support.audacityteam.org/music/working-with-audio-loops/making-audio-loops)

**Recommended starting default, to validate by listening:** a 0.5-second overlap for ambient recordings, adjustable from 0.05 to 2 seconds and capped at one quarter of the retained source length. These numbers are proposed product defaults, not a published universal optimum. A one-millisecond join spans only about 44 samples at 44.1 kHz; it can address a sharp discontinuity but cannot blend a seconds-long level ramp or a mismatched wave/bird event. Longer fades can also smear distinct events, so more overlap is not always better.

## Current implementation constraints

Inspected in this checkout:

- `request.schema.json` has no `loop` property and rejects unknown fields. Batch validation in `batches.mjs` separately permits only prompt/duration inputs.
- `src/qa.ts` chooses `regions[0]` for automatic cuts. It then applies independent fade-in/out filters; `qa-config.json` sets their default to 5 ms. Both behaviors are unsuitable defaults for continuous loops.
- `src/elevenlabs.ts` hard-codes the provider flag to false. Its decoding path also pads/trims to the requested duration and uses a limiter. The loop branch must audit codec padding and any processing state at the repeat boundary; appending silence to meet a duration can undo native loop generation.
- `src/service.ts` records `loop: false` in provider evidence. Actual request and processing choices must replace that constant.
- FFmpeg is already used for immutable cuts. Its installed `acrossfade` filter supports sample-count overlaps and selectable curves; no new audio framework is needed. Verified with `ffmpeg -hide_banner -h filter=acrossfade`. [FFmpeg filter reference](https://ffmpeg.org/ffmpeg-filters.html#acrossfade)

The reported model fade-in/out is a user observation, not a diagnosis from a new listening experiment. Our own existing outer fades are a separate, confirmed source of edge attenuation. Build loops from preserved original audio, not an already faded prepared clip.

## Proposed local processing

1. **Keep the useful continuous recording.** Start with the full original, including natural quiet intervals. Do not select only the first detected event, remove internal gaps, or normalize each piece separately.
2. **Find usable edge bounds.** Inspect a smoothed short-time energy envelope near each edge and compare it with the interior. Trim only a sustained intro/outro ramp or silence when there is evidence for it; do not blindly discard several seconds from every recording. Preserve natural wave swells and quiet forest passages. If no suitable continuous body is found, retain the source and offer manual bounds or another take. Do not amplify near-silence to disguise a fade.
3. **Rotate at a shared sample boundary.** Split the retained source into `A` and `B`, initially near its midpoint. Arrange `B` followed by `A`. The troublesome old end → old beginning is now inside the file. The new file end → beginning reconnects two samples that were neighbors in the source.
4. **Overlap and crossfade the internal join.** Overlap the last `F` samples of `B` with the first `F` samples of `A`. For the default equal-power blend use complementary cosine/sine gains across the overlap. Apply identical sample boundaries and gain envelopes to all channels; never rotate or align the stereo channels independently. Keep enough audio on both sides of the split for the overlap.
5. **Finish the whole loop once.** Measure peaks after mixing and apply the existing single global normalization target. Do not apply the normal outer fade-in/out, insert silence, or independently limit the two halves. Prefer global gain to a new stateful limiter at the boundary. Retain a lossless PCM WAV as the runtime asset.
6. **Audition both joins.** Check the internal crossfade and the exported file's end → beginning over at least three repetitions, with normal controls to stop/replay. Evaluate clicks, level dips/bumps, phase coloration and conspicuously repeated events. Signal diagnostics are advisory; the human still chooses the exact winner.

Sample-level construction, with `x` the retained source of `N` frames and split `M`:

```text
A = x[0:M]                       B = x[M:N]
output = B[0:len(B)-F] + crossfade(B[-F:], A[:F]) + A[F:]
output length = N - F
repeat boundary = x[M-1] → x[M]  (the original adjacent frames)
```

This is the user's relocation idea made precise. Moving an arbitrary tail without overlapping only relocates the bad join. The file boundary should remain the natural split; there is no need to add a second fade-to-silence there.

For a provider-native loop, use the same dedicated loop-processing entry point but first assess whether it can be retained with only global gain. Preserve a usable native loop's timing. If repair is needed, offer/apply the documented source-based crossfade treatment as a new derived version, never another automatic paid request. Validate the decoded waveform, not just the provider flag.

### Duration semantics

“Whole audio” means retaining the useful continuous body instead of a single active event. It cannot also mean preserving every original sample position and the exact requested duration after edge removal and overlap.

For the first version, **keep `duration_seconds` as the source-generation budget**, consistent with the current API, and report the actual loop length prominently. Example: 20 seconds generated, 1 second removed at each edge, and a 0.5-second overlap yields a 17.5-second loop. Do not silently stretch, repeat, pad, or request extra generations to claim a 20-second result. Exact-final-duration generation would require extra source/headroom and a distinct, explicit contract; it is outside this first change. Respect existing provider duration caps.

## API and Studio contract

### Generation

Add optional boolean `loop`, default false, to each batch sound and to the shared generation request. Example batch input:

```json
{
  "name": "Looping ambience",
  "sounds": [
    {
      "key": "rain_on_leaves",
      "prompt": "Steady rain on leaves with a consistent natural texture",
      "duration_seconds": 20,
      "loop": true
    }
  ]
}
```

- For `/studio/jobs` and CLI/workflow inputs, place it in `request.loop`.
- Accept it on sound regeneration. Omission there inherits that sound's latest effective setting; explicit false disables looping for the new generation. New standalone requests with no flag retain today's non-loop behavior.
- ElevenLabs recreation inherits the selected version's effective loop intent, with an explicit override available in the recreation request. Keep paid generation authorization and uncertain-request handling unchanged.
- Update strict validators, types, prompt planning, provider request construction, queue persistence and evidence together. Prompt rewrites must preserve loop intent. Record the user's wording separately from any generated loop instructions.
- Include the effective flag in new operation identities. Same key/same effective request must reattach; changing loop intent with the same key must conflict. Preserve compatibility with historical requests that omitted the field and their stored signatures—do not rewrite old keys or evidence.

Studio gets a native **Loop** checkbox beside Duration in Create and Edit prompt / Generate more. Helper text: “Prepare a continuous loop. Trimming and blending may shorten the result.” Persist the draft, inherit it for subsequent generations of that sound, and show a Loop badge plus actual duration on resulting versions. Changing the checkbox affects future work; it must not rewrite an existing batch or winner.

### Cutting, preview and export

- Route loop requests through loop-aware cutting. Extend the existing cut request with a loop mode and optional crossfade length; keep Start/End in original-source seconds. Editing an existing loop retains its effective mode unless explicitly changed.
- Under the inline editor, expose **Loop**, **Crossfade (seconds)** and **Preview loop**. Keep ordinary trim behavior when Loop is off. Curve selection, edge analysis and processing evidence can be in secondary loop details/Diagnostics.
- Preview the actual proposed rotated/crossfaded buffer repeatedly, including its internal join. Simply repeating the original trim cannot demonstrate the saved loop. Preview does not create a durable version or select a winner; use a nonpersistent processing preview or an equivalent sample-accurate local render.
- Use gapless scheduled/buffer playback for seam audition. Do not implement repetition with an `ended` handler that reloads/restarts a media element, which introduces a scheduling gap unrelated to the asset. Reuse native Web Audio buffer looping if the existing player cannot provide reliable seam audition; verify it against repeated exported PCM. [Web Audio looping specification](https://www.w3.org/TR/webaudio/#looping-AudioBufferSourceNode)
- **Save loop** creates one immutable derived version. Download and winner export bind that exact version. Changing a loop bound or fade does not silently replace the winner.
- Record source hash, source bounds, rotation split, overlap frame count, curve, processing version, gain, output frame count/hash and native-provider-loop flag. The derivative timeline is reordered: do not label it as an ordinary contiguous trim. Preserve existing originals, reviews and exports.

## Acceptance and implementation boundary

Implement later; this note does not authorize changing the current ambient batch, selecting winners or spending provider credits.

1. Loop omitted/false reproduces the existing non-loop behavior. Loop true survives API submission, queueing, retries, restart, UI edits and export metadata. Conflicting idempotency requests are rejected without an extra generation.
2. A mocked ElevenLabs request sends true only when requested. A good native loop is not broken by outer fades, codec-padding assumptions or duration padding.
3. Synthetic sources with known edge ramps verify that retained bounds omit the ramps while preserving interior quiet passages. Constant ambience is not automatically shortened by a fixed edge crop. Unsuitable/too-short inputs yield an actionable result and preserve the source.
4. Sample-level tests verify `N-F` output frames, the natural wrap boundary, both sides of the crossfade, stereo alignment, finite samples and peak ceiling. Test noise, a correlated tone, transient-rich ambience and silence. Do not require endpoint samples to be numerically equal; normal neighboring source samples can differ.
5. Audition rain, forest and shoreline through at least three cycles. Check for texture changes, repeated bird calls and unnatural wave timing as well as clicks. Tune the proposed overlap/edge heuristics from listening; do not report semantic success from signal checks alone.
6. Preview causes no cut/select POST or durable version. Explicit save creates one version; reload and winner export preserve that exact waveform and its actual duration. Verify a repeated exported PCM sequence as well as Studio playback.
7. No existing audio, winners, histories or paid-request recovery state changes. Use isolated fixtures and mocked providers for implementation verification; any later real generation is a separate authorized action.

Start with the boolean, dedicated cut path, adjustable overlap, accurate preview and immutable evidence. Beat-aware music looping, model-level circular generation/inpainting, automatic transient relocation, time stretching and exact-length synthesis are separate problems, not prerequisites for ambient loops.

## Implementation checkpoint — 11 September 2026

Implemented the shared `loop-audio.mjs` sample renderer and explicit `{ loop: true }` QA cut path. It uses conservative automatic edge bounds (or original-source manual bounds), shared stereo rotation, adjustable equal-power/equal-gain overlap, and one global gain with no outer fades. Cut evidence records the bounds, split, overlap, curve, gain and output frames; existing source/output hashes remain in the QA report. Export verification checks frame evidence against the WAV, and version/winner duration reporting uses the actual output length.

Verification uses isolated synthetic sources only: noise, correlated tone, transients, silence, edge ramps, interior quiet, stereo alignment, exact overlap endpoints, source preservation and three concatenated exported PCM repetitions. No paid requests or existing audio mutations.

Remaining: generation boolean propagation and historical idempotency compatibility; regeneration/recreation inheritance; native ElevenLabs preservation and decoding; prompt guidance; Studio generation/editor controls and shared-renderer gapless preview; full integration/restart/winner checks; rain/forest/shoreline listening and heuristic tuning. The renderer is an implementation baseline, not proof of listening quality or completion of this plan.

### Generation and native-loop checkpoint

Loop intent now passes through strict request/run schemas, local and ElevenLabs generation, default QA cuts, queued regeneration, recreation overrides, retries, and restart. False/omitted standalone requests retain historical signatures. New sound revisions inherit the latest effective setting; retries reuse the accepted operation's setting. Queued explicit false survives canonicalization and restart. Local generation stores the actual prompt separately and appends continuity guidance; prompt planning also receives loop intent while retaining the user's original wording.

ElevenLabs sends the effective flag and keeps the existing MP3 format. Loop decoding honors codec metadata without requested-duration padding, trimming or a stateful limiter; a decode receipt records frame count and global gain. The shared renderer assesses boundary steps and edge energy: a usable native waveform retains its frame count with global gain only, while flagged sources or explicit repair requests use rotation/crossfade. These diagnostics are advisory, not listening approval. Mocked provider verification covers native timing, export, conflict rejection and restart with exactly one provider call.

Targeted checks also cover API default loop cutting, unchanged historical false/omitted identities, queued concurrent edits, prompt guidance and inheritance after restart. Remaining work is Studio controls/preview, broader end-to-end verification, and rain/forest/shoreline listening. No existing audio or winners changed and no provider credits used.

### Studio and verification checkpoint

Studio now has native Loop checkboxes beside Duration in Create and batch prompt editing, persisted drafts, Loop version badges, source-bound loop editing, adjustable crossfade/curve, Preview loop and Save loop. Preview reads source PCM directly (without device-rate resampling before the edit), invokes the shared renderer, quantizes using the same PCM16 conversion as export, and repeats with a native Web Audio buffer source. Pause, another audio player, editor closure and navigation stop the preview. Native loops retain their original timing until a repair setting is changed.

Browser evidence on the isolated `studio-ui-a8JgZm` fixture: a 3-second source produced a 110250-frame / 2.5-second preview; the Web Audio context ran for 9.497 seconds with `loop=true` and zero POSTs. Candidate count stayed 15 before saving. Save sent one cut POST, created exactly one candidate (count 16), and left selection count zero. Every sample in the saved PCM matched the actual browser playback buffer. Explicit fixture selection and reload retained candidate `11a7f720a581106dfddbade9a2566009e7d353852c03ebcf982f40baee3143a7` and its 110250-frame output. The fixture servers and browser sessions were closed.

`pnpm build` and `pnpm test:audio-factory` pass (46 JavaScript tests, 2 Python tests); log: `.test-artifacts/loop-suite.log`. The QA integration check now compares every exported PCM sample with the preview conversion. A final visual check confirmed that Duration and Loop sit alongside each other.

Listening is **pending human feedback**, not passed. Audition-only three-cycle WAVs were derived from the first completed variant of each sound in the existing ambient test batch, using preserved originals without changing that batch, its winners or its files. Evidence and controls: `.test-artifacts/loop-listening-q3UHrS/index.html` and `evidence.json`. Rain yields 16.6 seconds, forest 18.95 seconds and shoreline 19.5 seconds per loop. `scripts/loop-listening-fixture.mjs` reproduces these audition artifacts from three supplied candidate hashes, in a fresh output directory. The user was asked to assess clicks, level changes, bird-call repetition and wave timing. Do not mark acceptance item 5 complete from signal checks or browser playback mechanics alone.

### Final acceptance

The user approved the rain, forest and shoreline audition tracks with “Approved all 3 loops.” Their saved WAV hashes were verified before recording approval in the audition evidence. All seven acceptance items are now satisfied; see `acceptance.md`. The existing passing build and full-suite evidence remains applicable because this closeout changes only review records and documentation. No production winner or batch was changed.
