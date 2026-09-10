# Usage and API

Run from the checkout root. The `run` launcher installs missing Node dependencies and builds the tool. Follow the [README](../readme.md) for local model, Ollama and optional ElevenLabs setup. `./run setup` prepares pinned GGUF/Metal and deterministic signal dependencies. Setup allows 90 minutes; generation has a three-minute deadline per operation. Follow progress in `.runtime/setup.log`; do not duplicate a quiet operation.

## Batch commands

```sh
./run make examples/request.json
./run workflow examples/workflow.json a-stable-idempotency-key
./run studio
```

A request has a nonblank `prompt` (1–2000 characters), `duration_seconds` (0.5–60; default 5), and optional integer `seed` (0–2147483647). Unknown fields are rejected. Local batches call Ollama `gemma4:latest` once (two-minute bound), preserve the original as variation 1 and persist four validated distinct rewrites, then generate each sequentially. A local prompt gets at most three attempts, retrying only silence/static with distinct seeds. Silence/static exhaustion continues the next prompt; operational failure stops. All produced takes are preserved.

A workflow input is `{ "request": { "prompt": "A cat hissing", "duration_seconds": 5 }, "provider": "local" }`. Provider defaults to `local`; explicit `elevenlabs` makes one generation with the supplied prompt. `sound_parent_id` links another job to an existing sound. `make` prints variants/attempts; `workflow` prints the full job. Reusing an idempotency key with different input is a conflict. Semantic QA options (`clap: true`, target/alternatives, automatic mode, budgets) are rejected. `{ "clap": false }` remains compatible but does not load a model.

## Processing and retention

Deterministic processing selects the first active region, applies 5 ms fades and normalizes the peak to −3 dBFS. Silence has no active region. Suspected static requires persistent, steady broadband noise; thresholds live in `qa-config.json`. Rhythmic-bass evidence remains advisory and never causes retries. The complete original recording survives processing. All semantic correctness requires listening.

With the temporary service stopped:

```sh
./run inspect <run-id>
./run analyze <run-id> examples/qa-signal.json
./run cut <run-id> examples/cut.json
./run retain <audio-path>
```

Offline inspect/analyze/cut require the source in `out/runs/<id>`. Studio can trim any durable candidate. Explicit cut bounds require both start and end within the original audio. `normalize: false` disables gain changes; `peak_db` allows −30 through −3. Cuts create new versions without changing source bytes or previous decisions.

`retain` accepts durable candidate audio and legacy cut exports, verifies their provenance, and copies to a fresh `.runtime/retained/clip-*`. Copy the whole directory into the consuming project. Neither download nor preference implies approval or grants model/output rights.

## Studio API

Studio binds `127.0.0.1:8767` and remains open after generation. Only one workflow owner and one active batch or cut are allowed. Cancellation stops owned generation/setup, drains accepted signal processing, and never starts the remaining variations. Ctrl-C closes Studio safely.

The browser bootstraps `GET /studio/session` with `X-Studio-Bootstrap: 1`, receiving an HttpOnly SameSite=Strict cookie and JSON `csrf`. Browser mutations require the exact Origin and `X-Studio-CSRF`. Non-browser clients use `Authorization: Bearer <private-token>` from `.runtime/token`, with no Origin. This is separate from `ELEVEN_KEY`; never log either secret. Host validation and no CORS remain enforced. JSON bodies are bounded to 16 KiB.

| Endpoint | Behavior |
| --- | --- |
| `POST /studio/jobs` | Workflow input, required `Idempotency-Key`; 202 with durable job immediately |
| `GET /studio/jobs` or `/studio/jobs/<id>` | Progress, five variant slots, attempts/seeds, candidate IDs and results |
| `GET /studio/readiness` | Local generation presence and ElevenLabs key configuration |
| `POST /studio/jobs/<id>/cancel` | `{}` stops owned work; repeated cancellation is safe |
| `POST /studio/jobs/<id>/recover` | `{}` resumes verified checkpoints; uncertain operations are not replayed |
| `POST /studio/jobs/<id>/resume` | `{}` and a new idempotency key start a fresh batch after failure/cancellation/interruption |
| `POST /studio/jobs/<id>/acknowledge` | Acknowledge an uncertain interrupted outcome without generation |
| `GET /studio/candidates` | Durable candidates and their exact provenance |
| `POST /studio/candidates/<sha>/recreate` | `{}` and required idempotency key; one ElevenLabs request using this version's generation prompt and requested duration |
| `POST /studio/candidates/<sha>/select` | `{ "event_id": "<32 hex>", "supersedes": null }`; supersede the latest event ID on subsequent changes; stale changes return 409 |
| `GET /studio/selections` | Latest preferred exact candidate per sound |
| `GET /studio/candidates/<sha>/selection-history` | Append-only preference history for this sound |
| `POST /studio/candidates/<sha>/cut` | Cut options; a new immutable version |
| `POST /studio/candidates/<sha>/feedback` | Existing human review event; independent of preferred take |
| `GET /studio/candidates/<sha>/audio` or `/source` | Range-enabled playback |
| `GET /studio/candidates/<sha>/export` | Verified TAR including feedback and preferred-take history |

Legacy QA setup/evaluation/continue routes return 410. Historical jobs are read-only; start a new batch to use the new flow.

## Recovery and storage

`.runtime/studio/` holds durable jobs, candidates, feedback and selections. `out/` is temporary and may be cleared by the next compute session after setup and port acquisition. Preserved candidates survive. Never clear unrelated caches or output to recover.

After disconnects, resend the same body and key. A completed request reattaches without computation. Restart marks running jobs interrupted; it never automatically restarts them. Explicit recovery reuses persisted prompts, generations and cuts where their completion is verified. Interrupted planning or an uncertain generation stops with an explanation. Acknowledge uncertainty or explicitly start a new batch to proceed.

ElevenLabs writes a durable submission marker before sending the paid request. Provider MP3, response hash, request ID and reported cost are kept outside `out/`. Missing/uncertain results never trigger an automatic second paid request, including after restart. Fix configuration and explicitly recreate again with a new key if appropriate.

## Legacy temporary service

`./run start` (or foreground `serve`) opens the local GGUF service on `127.0.0.1:8766`. `./run status` and `./run stop` address this service, not Studio. It stops after 30 idle seconds; health polling does not extend the timer. All routes require the private bearer token and reject any Origin header.

`POST /v1/sound-effects` generates one raw local take; `GET /v1/runs/<id>` and `/audio` read it. `POST /v1/runs/<id>/analyses` runs signal analysis, and `/cuts` prepares a cut. Use the returned Location for reports. Generation idempotency here is session-scoped; use Studio/workflow for durable batches. Only one compute operation runs at a time (429 with Retry-After). Stop drains accepted work. Offline maintenance requires this session stopped.

Studio duration choices are 5, 10, 20, 30 and 60 seconds (default 5). The 60-second option is local only; ElevenLabs recreation supports at most 30 seconds.

## Multi-sound agent batches

The [agent batch API](agent-api.md) adds a durable queue, one review link per batch, prompt revisions, optional queued ElevenLabs recreation, and a hash-bound winners manifest. It uses the same Studio authentication and saved candidates.

## Repository task runner

`python3 scripts/run_codex_tasks.py <task-folder>` warns after five minutes without Codex output and reports pending command/tool items. Silence never triggers a retry. Each implementation and review attempt has a two-hour wall-clock deadline, allowing the supported 90-minute setup plus verification. Set `--execution-timeout-minutes <positive-integer>` before starting work that needs a different budget; output and pending operations do not extend it. A failed Codex turn, nonzero process exit, or expired deadline enters the existing bounded recovery/retry flow (at most six task attempts). Individual command failures remain available for Codex to handle within that budget.
