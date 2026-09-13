# Studio

Start `./run studio` and open http://127.0.0.1:8767.

1. Describe a sound, set Duration and optionally enable **Loop**, then choose **Generate 5 local takes**, or open a batch from Library.
2. Listen and **Replay** clips. Each request has a generation heading; clip numbers remain stable across later requests and reloads. Earlier generations stay available in collapsed groups.
3. Optionally open **Trim** beneath a clip. Drag the Start and End handles on the original waveform, or focus either handle and use arrow keys to adjust by 0.01 seconds. **Play / Pause** auditions the selection without saving; click the waveform to seek. Playback stops at End, and the next Play starts at Start. Moving a handle pauses and returns to Start. Only one player runs at a time.
4. **Save trim** creates a saved version with the existing fades and normalization. Preview plays the source interval, so it does not include that processing. Saving never replaces a winner; **Download** always uses the saved version.
5. For continuous audio, enable **Loop** in the editor and adjust **Crossfade (seconds)**. **Loop details** offers equal-power or equal-gain curves. **Preview loop / Stop loop** auditions the proposed processed waveform repeatedly without saving; listen for at least three cycles. The original waveform cursor stays stationary during this processed audition. **Save loop** creates that version without changing the winner. Usable native loops keep their timing until repair controls change.
6. **Use this take** selects that exact version. Its Selected badge persists after reload, including when newer clips arrive. Choose the next sound explicitly, then **Export winners** when the batch is ready.

Duration is the source-generation budget. Loop trimming and blending can shorten the result; the Loop badge and clip duration describe the saved version. Start/End always address the original source, even though loop processing reorders it.

**Generate more** adds another generation without replacing earlier clips or the winner. **Edit prompt** changes the next request, including its Loop checkbox. New generations inherit the sound’s latest loop setting unless explicitly changed. Clip secondary actions include **Generate with ElevenLabs**, which makes a new rendition from the prompt, original requested duration and selected version’s loop intent. It does not transform the selected audio. Configure `ELEVEN_KEY` in the checkout's ignored `.env`; ElevenLabs supports requests up to 30 seconds. Local duration choices are 5, 10, 20, 30 and 60 seconds.

A fresh standalone Create view starts with an empty listening desk; open historical sounds from Library. Starting a request immediately clears unrelated results and shows its prompt, stage, take/attempt count and elapsed time in the listening pane. Reloading reconnects active work. Completion and errors remain visible alongside that request’s results. Pending generation groups show Queued, Generating, Ready or Failed beside the sound they belong to. You can keep listening and trimming while generation runs. Background refresh preserves playback, open groups and draft bounds. Failed actions show a nearby error and preserve saved work; retrying an uncertain request reuses its durable identity.

Library filters are **All**, **Selected** and **Needs selection**. **Settings → Diagnostics** contains signal checks, evidence snapshots, raw request records and historical human reviews. Existing audio, exports, review history and selection history remain preserved. Downloads retain their provenance and exact-version evidence.

Interrupted work offers explicit recovery; canceling preserves finished audio. The Studio remains available after compute exits.

[API and recovery details](usage.md).

## Curated library and history

**Library** contains reusable sounds: batch winners are added automatically, and each batch sound follows its current winner. Existing batch winners are included on startup. **History** retains every batch, take and saved version, including unfinished reviews.

For standalone sounds, **Use this take** or **Download** offers **Add to library / Not now**. Downloads proceed immediately. You can also add an exact version from **More clip actions** in the listening desk. Already-saved versions show **In library**; repeated saves do not create duplicates.

Search the Library by title, keywords, original request or generation prompt. Multiple words all have to match, in any order and across any of those fields. Play and download directly from results, open the original take, or use **Edit details** to change its title and comma-separated keywords. Both prompts remain visible under **Prompts and source**.

Keyword suggestions run locally when generation is idle. Sounds are saved and searchable immediately. If tagging fails, enter keywords yourself or choose **Retry keywords**. Manual title and keyword edits survive batch winner replacements. Metadata lives under `.runtime/studio/library/`; the verified audio remains in the existing candidate store. Back up the whole `.runtime/studio/` directory.

## Add a YouTube take

Set up the isolated extractor once with `pnpm setup:youtube` (or `node scripts/setup-youtube.mjs`). This pins yt-dlp 2026.08.19 and EJS 0.8.0 under `.runtime/youtube/`; FFmpeg, ffprobe, Node 22+ and at least 300 MiB free writable storage are required. Stop Studio before updating tools. Setup preserves a prior extractor environment for `node scripts/setup-youtube.mjs --rollback`, and restores it if installation fails. Import and ordinary editing do not require generator weights or a running Ollama service. Studio displays missing generation dependencies separately.

In a batch sound, choose **YouTube** beside **Generate more**. The popup starts with the current prompt draft as an editable query; press **Search** to fetch up to ten results. Audition in the embedded player or use its external YouTube link. Enter a video URL and start/end times, then choose **Add audio to this sound**. An interval can contain any positive number of decoded samples, up to 60 seconds, including fractional seconds.

The accepted import joins the normal batch queue. Closing the popup leaves it running; **Cancel import** stops it. Reopening or refreshing reconnects to the same operation and restores its inputs. If acceptance was uncertain, retry the same request; the saved key prevents duplicate takes. A failed delivery can recover from its retained source. Failed/canceled imports preserve earlier takes and winners. Pausing the batch holds queued imports.

A completed import becomes another numbered audio take labelled **YouTube**. It initially preserves the full chosen interval as a non-loop clip. **Trim** opens Studio's normal editor: local second zero is the beginning of the imported interval. Level, fades, loop/crossfade processing and saved versions work as usual. Imports and saved trims do not choose winners. Use **Use this take** to select the exact version for Library and **Export winners**. Prompt, generation-duration and loop drafts remain unchanged.

Search has a one-minute deadline. Acquisition allows ten minutes, bounded network retries and at most 256 MiB compressed media, followed by a two-minute decoding budget. The 200 ms disk monitor allows brief overshoot; the final size is checked before accepting media. A full audio-only fallback is limited to known videos no longer than ten minutes. Temporary compressed media is removed; the durable interval remains editable offline. Section seeking does not promise sample-exact synchronization with the YouTube player's timeline.

Access/rate-limit/extraction errors remain errors; no generation is substituted. Try another public, finished video or retry later. Cookie capture, proxies, a metadata catalog, Data API keys and source-license claims are not part of this workflow. Human listening and selection remain your decisions.
