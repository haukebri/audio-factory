# Audio batches for AI agents

Use a batch when a human must choose each sound. Submit the entire asset list once, give the human the returned `review_url`, then collect the winners later. The agent never chooses a winner based on a signal score.

Studio must be running (`./run studio`, default `http://127.0.0.1:8767`). It owns the persistent queue and remains running independently of API clients. Disconnecting the agent does not cancel generation. The review link opens on the same computer; this is not a hosted public link. Use the existing private token from `.runtime/token` in an Authorization bearer header, never in a URL or printed command. Browser users authenticate through Studio's session bootstrap.

## Submit

`POST /studio/batches`, with `Content-Type: application/json` and a saved `Idempotency-Key`:

```json
{
  "name": "Village sound effects",
  "sounds": [
    { "key": "dog_bark", "prompt": "A dog barking", "duration_seconds": 5 },
    { "key": "cat_hiss", "prompt": "A cat hissing", "duration_seconds": 5 }
  ]
}
```

The batch name is 1–200 characters. Submit 1–50 sounds within a 128 KiB body. Asset keys are unique within a batch, 1–128 letters, digits, underscores or hyphens. Prompts are 1–2000 nonblank characters. Duration choices are 5, 10, 20, 30 or 60 seconds; omission defaults to 5. Each sound also accepts optional boolean `loop`, default false. Unknown fields are rejected. Creation always uses local generation; no paid calls happen automatically.

For continuous ambience, a sound can be `{ "key": "rain", "prompt": "Steady rain on leaves", "duration_seconds": 20, "loop": true }`. Duration is the source budget; the prepared loop may be shorter. The flag requests continuity guidance and loop-aware processing, including native ElevenLabs looping on an authorized recreation. See [processing and preview](usage.md#continuous-loops).

A `202` response includes the saved `id`, a `Location` header and `review_url`, for example `http://127.0.0.1:8767/#batch/<id>`. It returns before generation completes. Repeating the same key and equivalent input returns the same batch; conflicting input returns `409`. Save the key before sending, and retain the returned ID in the consuming project's task context. A lost response is a reason to retry the same request, not create a new key.

Each sound runs the existing five-take workflow: original prompt first, four local text-model rewrites, and at most three attempts per prompt for deterministic silence/static failures. Queue work runs sequentially in submission order. Earlier results are available while later sounds generate. Operational failures remain visible and are not automatically retried; other queued sounds continue unless an uncertain interrupted workflow blocks the compute service.

Example submission from the checkout (the token stays inside the process):

```sh
python3 - <<'PY'
import json, pathlib, urllib.request
body = pathlib.Path('examples/batch.json').read_bytes()
request = urllib.request.Request('http://127.0.0.1:8767/studio/batches', data=body, headers={
    'Authorization': 'Bearer ' + pathlib.Path('.runtime/token').read_text().strip(),
    'Content-Type': 'application/json',
    'Idempotency-Key': 'village-sounds-v1',
})
with urllib.request.urlopen(request, timeout=30) as response:
    batch = json.load(response)
print(json.dumps({'batch_id': batch['id'], 'review_url': batch['review_url']}))
PY
```

## Human review and refinement

The batch link shows selection progress and a sound selector. For each sound, the reviewer can play the five cards, choose any saved version, edit the prompt and queue five more takes, or queue one ElevenLabs recreation of a particular take. All revisions keep the same asset key and sound membership. Existing originals and selections remain available; new generation does not silently clear a winner.

| Method / endpoint | Input / result |
| --- | --- |
| `GET /studio/batches` | All batches, progress and review links |
| `GET /studio/batches/<id>` | Sound keys, original requests, operations/job IDs, selections, status and errors |
| `POST /studio/batches/<id>/sounds/<key>/regenerate` | `{ "prompt": "Revised description", "duration_seconds": 10 }`; required new idempotency key; queues five local takes |
| `POST /studio/batches/<id>/sounds/<key>/recreate` | `{ "candidate_sha256": "<candidate>" }`; required new idempotency key; queues exactly one paid ElevenLabs request |
| `POST /studio/batches/<id>/pause` | `{}`; pauses pending work after the currently accepted sound job finishes |
| `POST /studio/batches/<id>/resume` | `{}`; releases pending work; does not regenerate failed or canceled jobs |
| `GET /studio/batches/<id>/winners` | Exact selected files and their hashes, or `409` if not ready |

Regeneration accepts optional `loop`: omission inherits the sound's latest effective setting, while explicit false disables it. Recreation accepts optional `loop` alongside `candidate_sha256`; omission inherits the selected version's effective setting. Save the complete request and key. The same key reattaches to its accepted intent; changing loop intent conflicts.

For loop review, use **Preview loop** for at least three cycles. Adjust the crossfade if needed, **Save loop**, then **Use this take**. Preview does not create a durable version or a winner.

Recreation validates that the candidate belongs to the indicated sound and uses its exact generated prompt and original requested duration. ElevenLabs supports at most 30 seconds; 60-second recreation is rejected before a paid submission. Paid actions require explicit user authorization. Retrying the same recreation key reattaches to the queued operation, including after a lost response.

Existing candidate selection, trim, audio, export and feedback endpoints are described in [usage](usage.md). The reviewer uses **Use this take** to create a persisted exact-version selection. Agent integrations should not call the selection endpoint to manufacture human decisions.

## Collect

Batch states are `generating`, `awaiting_review`, `ready`, `paused` or `blocked`. Each sound also exposes its operations and any failures. `progress.selected` counts sounds with saved winners. A batch is ready when every sound has a selection and no operation is pending. This includes a selected older take retained after a later failed revision.

While human review is pending, return the review link and let the agent do other work or end its turn. On resumption, check the saved batch ID. Do not keep an agent running in a tight polling loop or resubmit the whole batch. If a live task needs progress, polling every few seconds is sufficient.

When ready, `GET /studio/batches/<id>/winners` returns:

```json
{
  "batch_id": "...",
  "revision": "<selection-manifest hash>",
  "sounds": [
    {
      "key": "dog_bark",
      "candidate_sha256": "...",
      "selection_event_id": "...",
      "audio_sha256": "...",
      "duration_seconds": 1.82,
      "requested_duration_seconds": 5,
      "loop": false,
      "prompt": "A dog barking",
      "audio_url": "http://127.0.0.1:8767/studio/candidates/<sha>/audio",
      "export_url": "http://127.0.0.1:8767/studio/candidates/<sha>/export"
    }
  ]
}
```

The manifest's `loop` is the selected version's effective mode; `duration_seconds` is its actual output length, and `requested_duration_seconds` is the source budget. Configure the consuming player to repeat loop assets without altering the approved WAV.

Fetch each `audio_url` and `export_url` using the same bearer credentials. Verify downloaded WAV bytes against `audio_sha256`, save the manifest and full provenance archives, and map files into the consuming project using `key`. Use a fresh destination for a new manifest revision; avoid overwriting unrelated assets. Downloading the same revision can reuse already verified files.

The manifest is a snapshot: a later human choice changes its revision but never redirects its existing candidate URLs to different audio. Exact audio remains hash-bound. Export archives include current review/selection histories, so use the WAV hash and candidate ID—not archive-byte equality—to identify the selected sound. Readiness and preferences do not establish model/output licensing rights.

## Restart and failures

Batch definitions and queued revisions live in `.runtime/studio/batches/`, alongside durable jobs and candidates. Restart loads the queue and continues operations never submitted. Previously accepted jobs are looked up by their persisted deterministic IDs; completed, failed and canceled jobs are not submitted again. An interrupted job blocks further submission until explicitly recovered or acknowledged through the existing Studio recovery controls. Uncertain paid requests are never automatically replayed.

To retry a failed sound deliberately, queue a new prompt revision with a new key after resolving the failure. Pausing/resuming the batch does not authorize repeating uncertain operations. Closing Studio stops the queue and cancels its active job through the existing shutdown flow; pending jobs survive for the next startup.

## Search and reuse the sound library

`GET /studio/library?q=wooden%20knock` returns curated entries, newest additions first. Search matches every whitespace-separated term, case-insensitively, across title, keywords, original request and exact generation prompt. Omit `q` to browse all entries; the query limit is 2000 characters. Use the same bearer authentication as batches.

Current batch winners enter the library automatically, including winners saved before the library existed. Changing a winner updates that batch sound's entry. Standalone sounds enter only through an explicit Add to library action. Library membership is separate from acceptance/rejection feedback; agents must not manufacture human selection or consent.

Each entry includes `id`, `revision`, `title`, `keywords`, `original_request`, `prompt`, `candidate_sha256`, `audio_sha256`, `duration_seconds`, `loop`, `provider`, `created_at`, `updated_at`, `tagging`, `audio_url` and `export_url`. Batch entries also include `batch_id`, `sound_id`, `sound_key` and `selection_event_id`. `prompt` preserves the actual generation prompt when recorded, falling back to the generation request for older records. URLs identify immutable candidates; verify fetched WAV bytes against `audio_sha256` as with winner collection.

| Method / endpoint | Input / result |
| --- | --- |
| `GET /studio/library?q=…` | Matching library entries; empty query returns all |
| `POST /studio/library` | `{ "candidate_sha256": "<64 hex characters>" }`; adds the exact candidate, or returns its existing entry |
| `PATCH /studio/library/<id>` | `{ "revision": 1, "title": "Wooden tap", "keywords": ["wood", "knock"] }`; provide title, keywords or both |
| `POST /studio/library/<id>/keywords` | `{ "revision": 1 }`; explicitly queues new keyword suggestions, replacing manual keywords when completed |

Titles are nonblank and at most 200 characters. Keywords are at most 16 nonblank strings, each at most 80 characters; they are trimmed, lowercased and deduplicated. Unknown fields are rejected. Edits require the current revision and return `409` on conflicts; reload the entry before deciding how to merge a draft. Add requests are idempotent by candidate identity and require no separate idempotency key.

Keyword suggestions use the local text model when generation is idle. `tagging` is `pending`, `completed`, `failed` or `manual`; failures include `tagging_error`. Pending work survives restarts. A failed or timed-out attempt does not retry automatically or prevent saving, downloading, or searching prompts. Explicit retry queues another attempt. Human keyword edits and winner changes invalidate late model responses. Suggestions describe prompt intent, not an analysis of the waveform.

Example search (credentials remain inside the process):

```sh
python3 - <<'PY'
import json, pathlib, urllib.parse, urllib.request
url = 'http://127.0.0.1:8767/studio/library?' + urllib.parse.urlencode({'q': 'wooden knock'})
request = urllib.request.Request(url, headers={
    'Authorization': 'Bearer ' + pathlib.Path('.runtime/token').read_text().strip(),
})
with urllib.request.urlopen(request, timeout=30) as response:
    print(json.dumps(json.load(response), indent=2))
PY
```

### YouTube intervals in an existing batch sound

Use the same bearer authentication or Studio session/CSRF credentials as other routes:

- `POST /studio/youtube/search` with `{ "query": "rain on window" }` returns `{ "results": [{ "id", "title", "url" }] }` without changing the batch.
- `POST /studio/batches/:batchId/sounds/:soundKey/youtube` with `Idempotency-Key` and `{ "url": "https://www.youtube.com/watch?v=CBDZg1Jb_T4", "start_seconds": 120, "end_seconds": 125 }` returns HTTP 202 and the batch, including the stable import operation `job_id`.
- Poll the existing job/batch routes. `POST /studio/jobs/:jobId/cancel` also handles queued imports. `POST /studio/jobs/:jobId/recover` retries a failed/interrupted import under the same take identity; no paid or generation call is replayed. Interrupted read-only imports automatically recover when their batch queue resumes.
- `/studio/readiness` includes `youtube: { ready, tools }` and generation planner availability. Tool installation is a separate operator action, never part of a submitted import.

The server derives ownership from the batch sound's first job. The same key and canonical interval return the existing operation; key conflicts across inputs or sounds return 409. A new key explicitly requests another take. Imports cannot be submitted through the generic job creation route. Select and export completed imported candidates through the existing candidate selection, Library, winners and export routes. The legacy `evidence.generation` envelope discriminates acquisition with `runtime.backend: "youtube"`; it contains actual WAV properties and sound intent, with no fictitious model, seed or license. Retry URL/bounds remain in the accepted job input.
