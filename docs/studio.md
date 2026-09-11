# Studio

Start `./run studio` and open http://127.0.0.1:8767.

1. Describe a sound and choose **Generate 5 local takes**, or open a batch from Library.
2. Listen and **Replay** clips. Each request has a generation heading; clip numbers remain stable across later requests and reloads. Earlier generations stay available in collapsed groups.
3. Optionally open **Trim** beneath a clip. Start and End sliders use seconds in the original audio. **Replay selection** restarts that interval without saving; **Pause** stops it. Only one player runs at a time.
4. **Save trim** creates a saved version with the existing fades and normalization. Preview plays the source interval, so it does not include that processing. Saving never replaces a winner; **Download** always uses the saved version.
5. **Use this take** selects that exact version. Its Selected badge persists after reload, including when newer clips arrive. Choose the next sound explicitly, then **Export winners** when the batch is ready.

**Generate more** adds another generation without replacing earlier clips or the winner. **Edit prompt** changes the next request. Clip secondary actions include **Generate with ElevenLabs**, which makes a new rendition from the prompt and original requested duration. It does not transform the selected audio. Configure `ELEVEN_KEY` in the checkout's ignored `.env`; ElevenLabs supports requests up to 30 seconds. Local duration choices are 5, 10, 20, 30 and 60 seconds.

Pending generation groups show Queued, Generating, Ready or Failed beside the sound they belong to. You can keep listening and trimming while generation runs. Background refresh preserves playback, open groups and draft bounds. Failed actions show a nearby error and preserve saved work; retrying an uncertain request reuses its durable identity.

Library filters are **All**, **Selected** and **Needs selection**. **Settings → Diagnostics** contains signal checks, evidence snapshots, raw request records and historical human reviews. Existing audio, exports, review history and selection history remain preserved. Downloads retain their provenance and exact-version evidence.

Interrupted work offers explicit recovery; canceling preserves finished audio. The Studio remains available after compute exits.

[API and recovery details](usage.md).
