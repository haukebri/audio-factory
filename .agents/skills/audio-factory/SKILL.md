---
name: audio-factory
description: Create sound assets in a standalone human-reviewed batch, pause for the human to choose winners, then download and integrate them into the consuming project. Use when a development task needs new or replacement sound assets.
---

# Audio Factory

Treat sound creation as a **standalone task with a mandatory human handoff**. When a larger project needs sounds, recommend completing this step before starting work that depends on those assets. Generation completing or the API reporting ready is not permission to bypass the handoff.

## Connect from the consuming project

Keep the consuming project's absolute path separate from the Audio Factory checkout. Check existing sound assets and the project's asset-folder convention first.

1. Probe the known Studio URL, default `http://127.0.0.1:8767`. An authentication response means the server is reachable; do not start another instance. Verify the Studio batch API once authenticated.
2. Resolve the Audio Factory checkout from saved task context or the skill's real filesystem location: `../../..` works for this repository-hosted skill only. Verify the checkout contains `run` and `docs/agent-api.md`; do not assume the consuming project or a copied skill's parent is Audio Factory. If the checkout or credentials cannot be located, ask the human for the checkout folder or connection details. Read `<factory-root>/.runtime/token` inside the client process; never print it or put it in a URL.
3. If Studio is unreachable and the checkout is known, start its absolute `run` path with `studio` as a persistent process, recording the process identity and log location. Check readiness before submitting. If the checkout is unknown, ask the human to start Studio or provide its folder so the agent can start it. Do not install a second copy or scan the whole disk. If a reachable instance lacks the batch API, explain that it needs updating; do not replace it without authorization.

Read the [agent batch API](../../../docs/agent-api.md) for endpoint details and the [usage guide](../../../docs/usage.md) for operations. These relative links target the repository-hosted skill; if the skill was copied elsewhere, read the same files under the verified factory checkout.

## Request → human review → collect

1. **Request.** Assign stable asset keys and submit the requested prompts/durations to `POST /studio/batches` with one saved idempotency key. Use the batch API even for one sound so it has the same review handoff. Do not silently expand the asset list. Before submission, save the request and key in a local task record in the consuming project. Add the returned batch ID and review URL immediately after acceptance. Record the factory path, server URL, intended asset destination and whether this task started the server; never save credentials in this record.
2. **Stop for the human.** Give the review link and explicitly ask the human to listen, choose a winner for every sound, edit/regenerate or use ElevenLabs as needed, then tell the AI when done. Mark the sound task as awaiting human review and end the turn. Leave Studio running through generation and review. Do not choose winners, fabricate approval, poll while waiting for the person, or continue dependent project work using unapproved sounds. Independent work may continue only if separately requested.
3. **Resume on “done.”** Read the saved task record and inspect `GET /studio/batches/<id>`. If Studio stopped, reconnect/start it using the discovery procedure above and reuse the existing batch. If any sound lacks a winner or work is still pending, report that state and reuse the review link; do not treat the message as a substitute for actual saved selections. Never resubmit a batch after a lost response; reuse the saved key and request.
4. **Collect and integrate.** Once ready, fetch `/winners`, download the exact selected WAVs and provenance archives with bearer authentication, and verify every WAV hash. Save the manifest revision and provenance in the consuming project. Place WAVs under the project's existing sound-asset convention, typically `src/assets/sounds/`, named by asset key; keep provenance outside the runtime asset folder. Avoid overwriting unrelated files. Record the asset mapping and verified completion before continuing the parent workflow. Previously downloaded manifest revisions still identify their original audio after a later selection change.
5. **Close the owned server.** After all downloads are verified, stop Studio only if this task started it and no other batch, generation, cut, or human review still needs it. Verify the recorded process identity before signaling it. Leave pre-existing or shared instances running, and keep an owned server available if download/review remains incomplete. Record whether it was stopped or left running and why.

ElevenLabs is only an explicit paid recreation and supports at most 30 seconds. A user's authorized recreation may be queued via the batch API; never substitute a paid call for an unselected or failed local result on your own. Interrupted work requires the documented recovery/acknowledgement flow; restarting the agent is not authorization to repeat an uncertain operation.

## Generation and storage

Default generation uses Stable Audio 3 Medium GGUF / Apple Metal. Preflight Apple Silicon macOS, Node >=22.11, pnpm, uv, Python, Git, curl, FFmpeg, Xcode Metal compiler, disk/download access, and Ollama with `gemma4:latest`. `./run setup` prepares pinned audio and signal dependencies; allow the existing 90-minute setup budget and follow progress instead of duplicating a quiet operation.

`./run make <request.json>` preserves the original prompt as variation 1 and creates four slight rewrites in one text-model call, then generates them sequentially. Each prompt gets at most three attempts, retrying only silence/static with unchanged wording and a new seed. Operational failures stop; exhausted variants do not block the others. The returned JSON includes all variants and attempts. `./run workflow <workflow.json> <key>` uses the same flow and supports durable reattachment. Reuse saved input and key after a disconnect. If Studio is open, use its API rather than opening another workflow owner.

Both providers select the first active region, apply fades and peak-normalize to −3 dBFS. Complete originals and failed takes are retained. Inspect signal evidence and listen when available; never describe signal success as semantic or human acceptance. There is no listening-model QA or CLAP execution. Semantic execution options return migration errors.

Studio supports fast comparison and **Use this take**, saving the exact preferred candidate and append-only changes without rejecting alternatives. **Recreate with ElevenLabs** makes one paid request from that take's exact generated prompt and original duration. It needs `ELEVEN_KEY` in the checkout's ignored `.env`. Never expose the key or private Studio token. Paid generations require task authorization; uncertain submissions are never automatically replayed.

Keep consuming-project destinations separate from temporary `out/`. Candidates/history live durably in `.runtime/studio/`. `./run retain <audio-path>` copies an exact candidate and its evidence into `.runtime/retained/`; preserve the entire bundle on transfer. Verify hashes/provenance before deleting any source. A preference, signal report or download does not grant model/output rights; consult [third-party notices](../../../THIRD_PARTY_NOTICES.md).

Use explicit checkpoint recovery or a new request after investigating failures. Never clear unrelated caches, retained audio or another process's output. Close only owned sessions when finished.
