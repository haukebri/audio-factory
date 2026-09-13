# Sound scout — YouTube audio proof of concept

A standalone local app for **search → choose a video → extract an interval → listen/trim/adjust level → download WAV**. Uses yt-dlp, not the official YouTube API. No Audio Factory service, generation models, Library integration or metadata/provenance features.

## Run

From the repository root, with Node 22+, `uv`, FFmpeg and ffprobe installed:

```sh
# One-time isolated extractor setup. Does not replace your system yt-dlp.
test -x .runtime/youtube-poc/venv/bin/python || uv venv .runtime/youtube-poc/venv
uv pip install --python .runtime/youtube-poc/venv/bin/python \
  'yt-dlp[default]==2026.8.19' 'yt-dlp-ejs==0.8.0'

node experiments/youtube-sounds/server.mjs
```

Open **http://127.0.0.1:8768**. Use this exact address; `localhost` is intentionally not an accepted Host. Stop with Ctrl+C. Restart with the same command to recover saved clips.

Optional environment variables: `YOUTUBE_POC_PORT`, `YOUTUBE_POC_DATA` (a separate data directory), and `YOUTUBE_POC_YTDLP` (path to another tested extractor). The default extractor prefers the isolated environment above. Existing Audio Factory runtime/model files are not used or modified.

## Try it

1. Search for something concrete, such as `metal gate latch sound effect`. The first result appears in an embedded video player. **Play here** switches the player to another result and fills the video URL. Starting a saved audio clip closes the video player to avoid overlapping sound. A YouTube link remains available for videos that block embedding. You can also paste a URL directly.
2. Enter start/end seconds, up to 60 seconds, and choose **Bring in audio**. Search does not identify event timestamps automatically.
3. Play the imported clip and inspect its waveform. Enter local trim bounds and optionally adjust Level. **Save edited clip** creates another WAV; it does not overwrite the earlier clip. The player plays the saved version, so save to hear changes.
4. **Repeat playback** repeats the clip for auditioning; it does not create a seamless loop. **Download WAV** saves the current clip.
5. If acquisition fails, choose another video or expand the local-file option. Local files use the same start/end times and have a 256 MiB limit.

Clips are stereo 44.1 kHz PCM16. Each save peak-normalizes to −3 dBFS before applying the selected gain; positive gain is limited to a −0.1 dBFS peak. It is not cumulative gain or an AI cleanup tool. Repeated identical URL imports or edits reuse the completed result. Local file uploads create a new clip each time.

Files live under `.runtime/youtube-poc/data/clips/<id>/audio.wav`. Tiny clip/job records support the UI and restart recovery. Search results, downloaded compressed media and full source recordings are not archived. The saved working interval remains editable offline. Import a wider interval if you need more editing context later.

## Boundaries

- Only finished, publicly accessible YouTube videos; no playlist, account-cookie, proxy or token-provider workflow. Extraction can break when YouTube changes. An access failure is an error, not a reason to fabricate a result.
- One audio job at a time; cancel terminates owned subprocesses. Ten-minute acquisition budget, two retries for downloader network/fragment failures, 60-second search budget. If section acquisition fails, a complete audio-only fallback is allowed only for a known recording of at most ten minutes.
- Downloads have a 256 MiB limit checked during writing and before use. The disk monitor runs every 200 ms, so it is not a strict instantaneous filesystem quota. Completed WAVs are committed atomically; unfinished work after a restart is marked interrupted and can be retried.
- Final local cuts are sample-checked. Timestamp-section extraction still depends on the source's seek/decoder behavior; this does not promise sample-exact alignment against YouTube's player timeline.
- No seamless-loop processing, source separation, EQ or Audio Factory integration in this POC. Those remain integration/follow-up work in the [milestone](../../docs/milestone/06-youtube-sound-sourcing.md). Human listening decides whether a sound is useful.

## Verification

```sh
node --test experiments/youtube-sounds/poc.test.mjs
```

This runs without YouTube, model calls or API credits. It checks URL/input boundaries, an exact cut against a known tone marker, stereo PCM16/rate/peak, subprocess cancellation/deadlines/output limits, local file upload, trim/download/range responses, duplicate edits, origin/Host protection, restart recovery and single-owner storage.

With the server running, `node experiments/youtube-sounds/player-browser-check.mjs` checks embedded-player selection, URL synchronization, closing/audio handoff and mobile sizing through `agent-browser`. This optional browser check performs a live YouTube search.

Live/browser verification is recorded in [verification.md](verification.md). Normal tests do not depend on video availability.
