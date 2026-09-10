# Studio

Start `./run studio` and open http://127.0.0.1:8767.

1. Describe the sound and choose **Generate 5 local takes**. More options retains constraints, intended event count and an optional seed.
2. Your exact original is variation 1; four slight variations are prepared in one local text-model call. Each audio result appears as it finishes. Silence/static gets up to three attempts per prompt; earlier attempts remain expandable.
3. Listen to the cards. Starting a player pauses the other players. **Use this take** saves the preferred exact version for this sound; selecting another appends a change to its history. Other takes remain unreviewed unless you explicitly review them.
4. **Recreate with ElevenLabs** makes one paid generation from that take's exact generated prompt and original requested duration. It uses the same first-region trim, fades and −3 dB peak normalization. Configure `ELEVEN_KEY` in the checkout's ignored `.env`.
5. **Open / trim / download** exposes the original recording, prepared clip and saved trims. New trims preserve original audio and have separate review records. **Generate 5 more local takes** creates another batch in the same sound.

Library groups related requests into sounds and actual generations into takes. Analysis snapshots are not extra takes. **Open selected best take** recalls the saved preferred version. Approve/reject notes remain separate from preference; downloads include both review and selection histories. Historical QA evidence remains readable but no listening model runs.

Reviews from another tab refresh when Studio regains focus or reconnects; reopening a version also refreshes its review. If another review wins a save conflict, Studio shows the latest decision and keeps your draft. Read it, then choose **Approve** or **Save rejection** again to replace it.

Drafts, version choices and pending requests survive refresh. A lost response reconnects with the same key. Interrupted work offers explicit recovery; uncertain operations are never replayed automatically. Cancel stops the remaining batch and preserves finished takes. The Studio remains available after compute exits.

[API and recovery details](usage.md).

Studio duration choices are 5, 10, 20, 30 and 60 seconds (default 5). The 60-second option is local only; ElevenLabs recreation supports at most 30 seconds.
