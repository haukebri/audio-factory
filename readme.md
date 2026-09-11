# Audio Factory

Generate five local sound-effect variations, compare them in Studio, and save your preferred take. **Stable Audio 3 Medium GGUF / Apple Metal is the default.** ElevenLabs SFX v2 is an optional, explicit recreation of a selected take.

## Install and generate

Local generation requires Apple Silicon macOS, Node >=22.11, pnpm 9.15.9, uv, Python 3, Git, curl, FFmpeg and the Xcode Metal compiler. First setup downloads the pinned runtime and five model files (about 5.8 GB plus build/cache space). Install Ollama with `gemma4:latest` running on localhost:11434 for prompt variations.

```sh
./run setup
./run studio
# Or generate from the CLI:
./run make examples/request.json
```

Open http://127.0.0.1:8767. Describe the sound, set its duration, enable **Loop** for continuous ambience if wanted, and choose **Generate 5 local takes**. Variation 1 keeps your original prompt unchanged. One text-model call creates four slight variations using sound-library captions, concrete source/action/texture details and the `TrackType: SFX,` prefix, preserving the original events, order and constraints. The audio model runs them sequentially; each finished result appears immediately. A failed planner stops the batch before audio generation.

Non-loop requests select the **first active region**, apply short fades, and peak-normalize to **−3 dBFS**, delivering stereo 44.1 kHz PCM16 WAVs. The complete original recording is preserved. Use **Trim** to choose different bounds or inspect other events in the original.

Only deterministic silence and suspected-static failures trigger retries: up to three attempts per local prompt, with the same wording and a new seed. Failed takes remain available. An exhausted variation does not stop the other variations. An operational error stops the batch and preserves finished work. Static detection is a conservative broadband-noise heuristic; passing it does not establish sound accuracy.

## Continuous loops

Enable **Loop** beside Duration, or set `"loop": true` on a batch sound (`request.loop` for workflow inputs). Local loops use conservative edge trimming and rotation/crossfading. Usable native ElevenLabs loops retain their timing with global gain only. Loop processing adds no outer fades.

Duration is the source-generation budget; the final loop may be shorter. Studio shows the actual duration and a Loop badge. Under **Trim**, adjust **Loop** and **Crossfade (seconds)**, then use **Preview loop** to audition the proposed saved waveform repeatedly. Listen for at least three cycles. **Save loop** creates an immutable version; **Use this take** selects it. Download and winner export use that exact version. See [loop options and inheritance](docs/usage.md#continuous-loops).

## Listen and choose

Play the cards to compare variations; starting another player pauses the previous one. **Use this take** saves one preferred exact version per sound, with an append-only history when you change your mind. Other takes remain available and are not rejected. Earlier signal-failed attempts can also be played and selected. Approval/rejection notes remain separate from preference.

**Recreate with ElevenLabs** sends the selected take's actual generated prompt unchanged, with its original requested duration and effective loop intent. It makes **one paid generation**, with no automatic paid retries or extra prompt planning. Copy [`.env-template`](.env-template) to this checkout's ignored `.env`, then set your ElevenLabs API key:

```sh
cp .env-template .env  # First-time setup; keep an existing .env
```

```dotenv
ELEVEN_KEY=your_elevenlabs_api_key
```

An environment variable takes precedence. The provider is `eleven_text_to_sound_v2`, prompt influence 0.3, and looping enabled when requested. ElevenLabs does not support the local seed. Original MP3 responses and request receipts are retained in `.runtime/elevenlabs/`; uncertain submissions are never automatically repeated.

## Agent batches

Treat sound creation as a standalone step before project work that depends on the assets. The [audio-factory skill](.agents/skills/audio-factory/SKILL.md) supports this workflow from another project:

1. **Connect.** Check Studio at `http://127.0.0.1:8767`. Reuse an existing instance. If it is offline, the agent can start `<factory-root>/run studio` when the checkout location is known; otherwise it asks you to start Studio or provide the folder. API clients read the private token from `<factory-root>/.runtime/token` without displaying it.
2. **Request sounds.** Submit named prompts to `POST /studio/batches` with a saved idempotency key. Studio queues five takes per sound and immediately returns one review link. Save the batch ID and consuming-project destination so the task can resume later.
3. **Pause for human review.** The agent gives you the link and stops. Listen, choose a winner for every sound, and edit/regenerate or use ElevenLabs as needed. Tell the agent **done** when finished. Studio stays running; the agent does not choose winners or continue dependent work with unapproved sounds.
4. **Collect and continue.** After your message, the agent verifies the saved selections and retrieves `/studio/batches/<id>/winners`. It downloads the exact WAVs, verifies their hashes, and places them in the consuming project's sound folder, typically `src/assets/sounds/`. The manifest and provenance bundles are retained separately. The rest of the project workflow can then continue.
5. **Close when finished.** After verified downloads, the agent stops only a Studio instance it started, and only when no other generation or review needs it. Pre-existing or shared instances stay running.

See the [agent API](docs/agent-api.md) and [batch example](examples/batch.json) for request formats, review links, and recovery.

## Automation and recovery

```sh
./run workflow examples/workflow.json a-stable-request-key
./run retain <returned-audio-path>
```

`make` prints all variants and attempts. `workflow` prints the complete durable job; reuse its exact input and idempotency key to reconnect without generating again. If Studio is already open, use its API instead of starting another workflow owner. [Usage](docs/usage.md) documents API, authentication and recovery.

Jobs, candidates, original audio, feedback and preferred-take history live in `.runtime/studio/`, outside disposable `out/`. Studio downloads include verified audio/provenance, feedback and selection history. `retain` copies a candidate and its evidence into `.runtime/retained/` for transfer to another project. Preserve the whole bundle.

Listening-model QA, CLAP execution, evaluation tools and semantic retry budgets have been removed. Old execution options return migration errors. Historical audio and QA metadata remain readable and exportable; no historical listening decisions are rewritten.

## Checks

```sh
pnpm build
pnpm test:audio-factory       # Synthetic checks; no model calls or API credits
pnpm audio:smoke             # Five real local takes + ONE paid ElevenLabs recreation
pnpm audio:cases             # Inventory of 26 historical cases; no generation
pnpm audio:cases --run       # Paid: one ElevenLabs output per case, reuse existing results
```

The smoke uses durable keys under `.runtime/hybrid-smoke/`; reruns reuse saved outcomes. The case runner preserves the previous corpus in `.runtime/elevenlabs-sound-cases/`. Failed or uncertain operations stop for inspection; `--retry-failed` explicitly starts a new case attempt. Technical checks do not supply human listening acceptance.

See [Studio](docs/studio.md), [examples](examples/readme.md), and [third-party notices](THIRD_PARTY_NOTICES.md). Historical milestone documents record earlier behavior; this README and the current usage guide supersede their execution instructions.

Studio duration choices are 5, 10, 20, 30 and 60 seconds (default 5). The 60-second option is local only; ElevenLabs recreation supports at most 30 seconds.
