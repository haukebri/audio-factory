# Batch UX verification

Scope: [the batch UX plan](plan.md). The implementation uses existing job/operation identities, original-audio seeking, immutable cuts, durable selection events and export routes. No backend generation or approval model changes.

## Isolation and reproduction

Run from the repository root with Node, pnpm, agent-browser, FFmpeg and the existing signal Python environment installed:

```sh
pnpm build
pnpm test:audio-factory
node scripts/studio-ui-fixture.mjs
```

Wait for the fixture to print its root, PID and URL. In another terminal:

```sh
node scripts/studio-batch-ux-browser-check.mjs
node scripts/studio-batch-ux-edge-check.mjs
```

Do not run generation tests concurrently with the browser fixture: they share checkout compute ownership. The fixture uses an injected synthetic backend for both Local and ElevenLabs; its dummy key only enables provider controls. It does not call either provider or change real batches. The browser runner validates fixture readiness and synthetic candidates before mutations, uses a unique browser session and records evidence in `.test-artifacts/studio-batch-ux-results.json`.

Stop the owned fixture with Ctrl-C after checking. Its isolated `.runtime/studio-ui-*` root preserves the synthetic audio and selections for inspection. The historical UI-overhaul browser scripts describe the previous review/comparison interface; the command above verifies the current batch UX.

## Results

Verified 11 September 2026 by the main agent and independent implementation, browser-flow and review agents.

| Requirement | Evidence |
| --- | --- |
| Listen → trim/replay → winner → next sound → export | Two-sound browser journey through real Studio routes; final winner manifest and UI-downloaded TAR checked against the selected trim WAV SHA-256. |
| Stable generation identity and numbering | Two local requests retain groups and clips 1–10 after reload; a queued ElevenLabs operation becomes Generation 3 / Clip 11. Unit checks cover retry versions and reversed reload record order. |
| Inline source-region preview | Both native sliders, keyboard increment, repeat replay, Pause and automatic End stop verified. Zero cut/select POSTs before explicit actions; switching clips closes preview and retains draft. |
| Safe trim saving | Delayed save plus slider input cannot reenable duplicate submission. One cut POST creates the exact 0.21–2.41 second saved trim without selecting it. Saving is bound to the captured editor and bounds. |
| Persistent selection and feedback | Delayed double-click produces one selection POST. A failed selection retains the previous winner and shows a nearby error. Existing uncertain-response event recovery tests remain intact. |
| Queue states and readiness | Queued behind another sound → Generating → playable Ready, with no duplicate request across winner/group rows. Independent fault checks cover Failed, missing key, excessive duration and adjacent media errors. |
| Refresh preserves interaction | Draft, focus, disclosures and player identity remain stable. A reproduced background-winner change now keeps the old player running while showing the new winner first. |
| Completion | All selected hides Next/Pause and enables export when ready. A paused complete batch explains disabled export; Resume restores readiness. Redundant new-take navigation and completed global progress were removed. |
| Simplified normal flow | No Compare or Approve/Reject controls; saved versions/download/provider actions are secondary. Old Compare links return to listening. Settings diagnostics retain full candidate evidence, request data and historical review records. |
| Native, accessible layout | Trusted keyboard/slider and Pause interactions; 1280px and 375px screenshots inspected with no horizontal overflow. A reproducible pending-label shift was fixed by preserving button width. |
| Standalone sounds | Library opens the sound without waiting for the network queue; version disclosures survive refreshed results. Edited prompts preserve sound lineage. Legacy clips with no job record retain playable rows and exact export access using their existing generation identity. |

Final browser evidence: `.test-artifacts/studio-batch-ux-results.json` and `.test-artifacts/studio-batch-ux-edge-check.json`. The full journey completed across recorded phases; after correcting a runner label expectation, `.test-artifacts/studio-batch-ux-finish.mjs` resumed the same completed fixture batch and verified resume/export against the final assets without regenerating audio. Ten independent read-only edge checks passed with a POST guard. Screenshots: `.test-artifacts/studio-batch-ux-1280.png` and `.test-artifacts/studio-batch-ux-375.png`.

The full-flow fixture PID 75849 and final compatibility-check fixture PID 82591 shut down cleanly and were confirmed absent. Its synthetic audio, winner history and exports remain in `.runtime/studio-ui-jprzak` for inspection; rerunning the fixture against that root reopens saved work. No real batch, winner or export was changed, and no generation credits were spent.

## Checks and limitations

- `pnpm build`: passed.
- Focused frontend and sound-lineage checks: 8 passed.
- Full repository suite: 37 Node tests and 2 Python checks passed; log `.test-artifacts/batch-ux-tests.log`.
- `git diff --check`: passed.

The initial parallel repository runs exposed competing checkout-wide compute leases. The package test command now runs test files serially; this preserves the checks and avoids that collision.

Preview remains available during generation, but the existing backend can reject **Save trim** with “Factory busy.” The nearby error preserves the draft for retry after generation. Preview plays the source interval; saved versions additionally receive fades and normalization. Synthetic browser checks establish workflow behavior, not generated sound quality or OS screen-reader speech. Historical browser scripts for the removed review/comparison UI remain historical; use the two current commands above.
