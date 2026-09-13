# Proof-of-concept verification — 2026-09-13

The standalone POC is implemented and technically verified. The Audio Factory integration milestone remains open. No claim of human listening approval or perfect sound quality is made.

## Environment

Apple Silicon macOS; Node 22.22.3; isolated yt-dlp 2026.08.19 with yt-dlp-ejs 0.8.0; FFmpeg/ffprobe 9.0.1. The system yt-dlp was 2025.06.25 and rejected `--js-runtimes`; the isolated installation fixed the capability failure without upgrading the shared executable.

## Real acquisition

All three finished through the standalone HTTP import operation, using public access without account cookies. Downloaded WAVs were read back successfully.

| YouTube video | Requested interval | Output | Bytes |
| --- | --- | --- | --- |
| `--8D5cfAHvY` — metal gate latch | 5–10 s | 5.000 s stereo 44.1 kHz PCM16 | 882,044 |
| `YUb09871hpo` — opening/shutting a gate latch | 15–20 s | 5.000 s stereo 44.1 kHz PCM16 | 882,044 |
| `CBDZg1Jb_T4` — rain hitting a window | 120–125 s | 5.000 s stereo 44.1 kHz PCM16 | 882,044 |

Searches for `metal gate latch sound effect` and `rain on window field recording` returned real results through yt-dlp. Search-result ordering varied between requests. An attempted interval outside a selected short video's duration was correctly rejected; an explicit valid URL/interval succeeded afterwards.

## Browser and API checks

- Real search results, source-link selection, pasted URL and asynchronous import were exercised in a separate browser session.
- The five-second WAV reached browser media readiness 4 and played. Canvas displayed decoded sample data. Repeat playback wrapped to the beginning.
- Editing the gate clip to local seconds 1–3.5 with −6 dB saved a separate 2.500-second WAV (441,044 bytes). Existing audio remained saved.
- A local WAV was uploaded through the file control and converted to a two-second clip.
- A real additional YouTube import was canceled immediately. Repeating its active request returned the same job ID. Cancellation left the saved-clip count unchanged.
- All five saved clips and their downloadable WAVs survived a real server shutdown/restart. Browser refresh restored the selected local clip and playback duration.
- Desktop and 390 px mobile layouts were visually inspected. Mobile had no horizontal overflow.

Raw local evidence is in ignored `.test-artifacts/youtube-poc-live.json` and `youtube-poc-state-{before,after}-restart.json`. Screenshots are in `.test-artifacts/youtube-poc-{desktop,mobile}.png`. These are verification artifacts, not product metadata.

## Runnable deterministic check

`node --test experiments/youtube-sounds/poc.test.mjs` passed on the final implementation.

It uses a known three-second recording with silence, 440 Hz and 880 Hz regions. Cutting 1.25–1.75 seconds produced exactly 22,050 stereo frames, approximately 220 positive crossings and a −3 dBFS peak. This checks actual timing and signal output rather than merely trusting conversion flags.

The same check covers URL/bounds validation, malformed input, subprocess cancellation/time/output/disk limits, local HTTP upload, edited WAV bytes, duplicate edits, range responses, Host/Origin protection, interrupted-job recovery, completed-clip recovery and concurrent-owner rejection. JavaScript syntax checks passed. These checks require local FFmpeg/ffprobe but no YouTube network access or generation models.

## Remaining integration work

Studio/Library/batch selection, existing portable exports and seamless-loop processing remain outside this isolated POC. No factory runtime code or dependency manifest was changed. Human listening on intended game/product sounds is still needed to judge usefulness. Seek behavior varies by video/codec; the late-interval acquisition demonstrates functionality, not universal sample-exact synchronization with the YouTube player.

DeepSeek delegation was attempted for the frontend, but the worker exited without output or files. The main agent implemented and verified all delivered code directly.

## Embedded video player follow-up

Search now loads the first result into a single in-page YouTube iframe without autoplay. **Play here** changes that player and the import URL; **Close player** unloads it. Starting local audio also unloads the remote video. Search and extraction still use yt-dlp.

Real embedded playback of `--8D5cfAHvY` reached the end at 0:19/0:19. `node experiments/youtube-sounds/player-browser-check.mjs` passed result switching, URL synchronization, single-frame reuse, close/audio handoff and mobile width/minimum-height checks. The offline POC test also passed after the change. Videos that disallow embedding retain an external-link fallback.
