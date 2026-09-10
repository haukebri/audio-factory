# Studio UI overhaul verification

Implementation date: 2026-09-09. Scope: all five phases in [the overhaul plan](studio-ui-overhaul.md). No deployment or publication.

## Delivered phases

1. **Identity:** presentation groups immutable snapshots by generation ID, versions by exact asset/cut identity, and sounds by durable job lineage. Workflow results select exact preferred records. Historical ambiguous records require an explicit version choice. Separate generations remain distinct even when audio hashes match. Fresh jobs accept a validated `sound_parent_id`; retries retain their existing budget/recovery semantics.
2. **Create to listen:** Create/Library navigation, contextual progress and cancellation, manual default, optional retries and seed override, fresh bounded another-take requests, persisted pending identities and draft recovery. Settings and Evaluation are secondary destinations.
3. **Listening and decisions:** one selected player, A/B comparison with exclusive playback, explicit version comparison, exact-candidate approval/rejection, contextual trim and verified bundle download. Notes and blind state synchronize between listening and comparison without replacing players. Back restores selection, draft and scroll.
4. **Visual and mobile:** light teal tokens, compact local Avenir typography, two-column desktop Create/listen, focused mobile views, 44px page-authored controls, visible offset focus, no sticky bars, reduced motion, measured contrast.
5. **Verification and documentation:** regression/build checks, independent product/mobile/visual review, isolated browser acceptance and [user documentation](../studio.md). Existing uncommitted progress/submission work was incorporated; the original plan remains available.

## Evidence and isolation

Mandatory evidence: frontend/backend behavior, exact review/export contracts, browser journeys, requested widths/accessibility, and documentation. Existing security, generation, QA and recovery tests were reused where their implementation remained unchanged; the complete affected suite was run. Real model generation was unnecessary because generation/QA integration and model policy were unchanged. All new generation was bounded synthetic audio in owned fixture roots, using the real studio/workflow/cut/export routes. No user-library feedback, cuts, deletion or generation were performed.

- `pnpm build`: passed.
- `pnpm test:audio-factory`: 27 Node tests and 2 Python checks passed. Log: `.test-artifacts/studio-overhaul-tests.log`.
- `node --test studio-frontend.test.mjs studio-sound-grouping.test.mjs`: grouping, progress, queued actions, fresh seeds, idempotency, validated sound references and reload persistence passed.
- `node scripts/studio-ui-browser-check.mjs`: final results in `.test-artifacts/studio-ui-browser-results.json`; owned server/root/PID in `.test-artifacts/studio-ui-session.json`.
- Independent mobile report and desktop/mobile/400% screenshots: `.test-artifacts/studio-ui-review/`.

## Acceptance scenarios

| Plan scenario | Current evidence |
| --- | --- |
| Two deliberate takes; duplicate/reconnect only one | Browser generation/another-take journey and `identity` show distinct run IDs/seeds and numbered takes; grouping test verifies persisted seeds before execution. Browser `pending` double-submits, withholds the acknowledgement, reloads and finds exactly one request with cleared pending key. |
| Snapshots and trims are versions | Frontend behavioral fixture contains original, analysis, prepared and QA snapshots; one take and three versions. Browser `trim` preserves take count/run identity and shows the different saved version as unreviewed. |
| Identical audio, separate generations | Browser `identity` has matching delivered audio hashes and distinct generation IDs, seeds and take numbers. |
| Describe through download | Root browser completed prompt → generate → play → another take → A/B → approve → Download. Acceptance runner repeats playback, review and verified export. Hashes, datasets and QA configuration are in collapsed/secondary views. |
| Exact-version download/feedback | Browser `reviewAndExport`, `rejection`, `trim`, and `source`; studio integration test verifies bundle lineage, exact feedback, correction history and cut isolation. |
| Polling, drafts, focus, blind and exclusive playback | Browser `polling`, `comparison`, `compareDraft`, `compareReload`, and `back`; same player node/time, retained focus/note/trim, synchronized blind controls and notes, one playing A/B audio, restored selection/scroll. |
| Refresh, cancellation, interruption | Browser `pending`, `cancellation`, `states`, `completedElsewhere`, `completedReload`. Existing studio integration tests exercise durable cancellation and recovery against owned subprocesses and verify preserved audio. No automatic uncertain-operation replay. |
| 320/375/390/768/1280 widths | Independent rendered Create/Compare checks: document width equals viewport at every width. At 390×844, Generate bottom was 680.19px. Explicit A/B labels, stacked mobile cards and side-by-side desktop cards. |
| Keyboard, text, zoom, motion, contrast | Keyboard skip/main, composer, options, native play/seek and blind controls passed. 200% computed text passed at 320px. Actual Chrome Page zoom 400% produced innerWidth 320 and DPR 4 from a 1280px window, without overflow in Create/Compare. Reduced motion disables spinner animation; no fixed/sticky elements. |
| Empty, long prompt, many takes and failure states | Browser `library` tests empty plus 30 long-description sounds; `setup`, `states`, `disconnected`, `source`, and actual delayed/canceled generation cover preparation, failure, stopping, interruption, exhausted budgets and source-only audio. Earlier fixture duration mismatch produced a real failed-without-audio UI and was fixed in the fixture. |
| Reload and Evaluation | Browser `compareReload`, `back`, `completedReload`, durable feedback after reload, and dataset `evaluation` export. Blind review and exact feedback contracts remain intact; synthetic fixture records remain excluded from quality claims. |

Measured contrast ratios: text/canvas 13.80:1; secondary/white 6.09:1; secondary/selected 5.27:1; white/teal 6.37:1; error/white 6.48:1; control boundary/white 3.55:1; boundary/canvas 3.30:1; focus/white 6.10:1. Focus uses a 3px offset onto the surrounding light surface.

## Reproduce the browser checks

With dependencies built, the existing signal/FFmpeg test prerequisites, and `agent-browser` installed:

```sh
pnpm build
node scripts/studio-ui-fixture.mjs
```

The fixture creates an isolated `.runtime/studio-ui-*` store, seeds two bounded synthetic takes, selects owned ephemeral ports and prints its manifest. In another terminal:

```sh
node scripts/studio-ui-browser-check.mjs
```

The runner uses and closes its own browser session, writes incremental evidence immediately, and only mutates the isolated fixture. Stop the fixture with Ctrl-C; it closes its owned work and preserves all outputs. It can be restarted using its printed root and optional port. The normal user studio must never be substituted for this fixture.

## Limits

These checks establish UI/workflow behavior, not generated sound quality. No real model generation or physical-phone network access was claimed. Native accessibility-tree and keyboard checks were performed; OS screen-reader speech was not audited. The service's loopback, exact Host/Origin, CSRF/session, provenance and immutable-review protections remain unchanged. No new player framework, waveform editor, dark theme or distribution/deployment was added.

## Current batch winner browser check (task 13)

`node scripts/studio-batch-browser-check.mjs` exercises the current [agent batch contract](../agent-api.md): submit one 5-second local sound, open its returned hash link, wait for five generated cards, open variation 2, save and choose a distinct trim, lose the committed selection response, reload without remembered candidate/version preferences, recover the same selection event, and verify the winner candidate and downloaded WAV hash. No app methods or rendered outcomes are replaced; the sole injected fault is a lost fetch acknowledgement. Synthetic selections are test actions, not human listening acceptance.

Prerequisites: Node >=22.11, installed project dependencies, `pnpm build`, `agent-browser` with its Chrome browser available, FFmpeg, and the existing `.runtime/signal-venv/bin/python` signal dependencies. No model, Ollama or provider credentials are needed. Run from the checkout root:

```sh
mkdir -p .test-artifacts .runtime
pnpm build
node scripts/studio-ui-fixture.mjs
```

Wait until the fixture prints its JSON root/PID/URL manifest (initial synthetic seeding takes tens of seconds). Only then, in another terminal, run:

```sh
node scripts/studio-batch-browser-check.mjs
node --test qa.test.mjs studio-frontend.test.mjs studio-sound-grouping.test.mjs
```

The browser check allows 50 seconds per UI readiness condition and 60 seconds per browser command. It writes `.test-artifacts/studio-batch-browser-results.json` immediately after batch creation and after successful verification, and closes its uniquely named browser session on success or failure. Each invocation creates one new synthetic batch. The existing QA regression verifies 40–50 and 59–60 second cuts of 60-second originals through shared processing, compute and Studio routes, including bounds, exported bytes and invalid bounds.

Use only the owned fixture script: its injected backend, no-op setup and synthetic prompt planner prevent model/provider calls. Do not substitute a real Studio. Stop the fixture with Ctrl-C after checks, verify its PID and port have closed, then remove only its printed `.runtime/studio-ui-*` root. Preserve logs/results as needed and restore any previous session manifest saved before startup. Avoid running other generation suites concurrently with the fixture.

For the required negative control, use an isolated source copy with built files and existing dependencies: in `batches.mjs`'s `winners()` only, substitute the selected candidate with a different candidate from the same generation before constructing the manifest. Run the same fixture and browser command from that copy. It must reach and fail `Winner must bind the exact version chosen in the browser`, not fail startup or an earlier UI assertion. Stop its fixture, verify browser/process/port cleanup, and remove the isolated copy. Never apply this mutation to the working production file.
