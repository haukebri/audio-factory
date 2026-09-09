# Standalone usage

Run commands from the Audio Factory checkout root. The [root launcher](../run)
installs missing Node dependencies with the frozen lockfile and compiles the tool.
Generation requires Apple Silicon macOS, Node >=22.11, pnpm (pinned to 9.15.9),
uv, Git and FFmpeg; setup also invokes Python 3. Preflight those tools, network
access to GitHub/Hugging Face and package sources, free disk space (setup requires
at least 3 GiB), and ownership of port 8766 before starting expensive work.

Fresh standalone setup and two real MLX/CLAP jobs are verified in
[task 07](tasks/m01/07-fresh-installation.md#evidence) and
[task 08](tasks/m01/08-real-job-smoke.md#evidence). See the
[README installation sequence](../readme.md#install-and-generate) for tested
versions, network requirements, 104.50-second cold setup and 4.09 GiB storage
observations. Neither is a performance/minimum-space guarantee. Generation is
Apple Silicon macOS only; Linux is fixture-only, with no Linux execution claim.
The owner confirmed license availability and closed release readiness in
[task 12](tasks/m01/12-license-and-release-readiness.md#owner-resolution--2026-09-09);
model/output rights are separate. Neither smoke nor examples establish listening acceptance.

## One temporary job

```sh
./run make examples/request.json examples/qa-signal.json
```

`generate` is an alias for the same complete operation. Neither command accepts a
user idempotency-key argument. Inside the checkout, `pnpm audio:factory` accepts
the same arguments. The [examples](../examples/readme.md) document the actual
[request](../request.schema.json) and [QA/cut](../qa.schema.json) validators:
prompt must be nonblank, 1–2000 characters; duration is 0.5–30 seconds (default 3);
optional seed is an integer from 0 to 2147483647. Unknown fields are rejected.

The command prepares missing components, generates, analyzes, **already cuts
region 1**, and shuts down on success or failure. It prints JSON containing `id`,
prepared `audio`, advisory `qa` summary and detailed `report` path. Each model
operation runs in a subprocess that exits afterward. The pinned official Stable
Audio 3 MLX backend uses Small-SFX F16 DiT, F32 SAME-S decoder and F16 T5Gemma,
eight steps and no extra duration padding. There is no alternate backend or cloud
fallback. Generation has a 10-minute deadline; automatic setup and manual startup
allow 20-minute waits. Follow the same process and readiness/progress evidence;
several minutes of setup silence do not justify launching a duplicate job.

The signal-only example avoids CLAP setup. To request CPU CLAP, use
`examples/qa-clap.json` as the second file. Omitting that file enables CLAP with
the first 200 prompt characters against static, helicopter and silence. Explicit
CLAP requests need a nonblank target of at most 200 characters and allow up to
16 equally bounded alternatives. Missing CLAP during analysis is an explicit
advisory failure with available signal evidence preserved; a setup failure can
stop the job before analysis. Resolve setup or choose signal-only QA explicitly.

## Review, adjust and retain before retrying

Substitute the returned ID and audio path; angle-bracket placeholders are not
literal shell arguments. Run review operations sequentially before another session:

```sh
./run status
./run inspect <run-id>
./run analyze <run-id> examples/qa-signal.json
./run cut <run-id> examples/cut.json
./run retain <audio-path>
```

`status` should report stopped after `make`. `inspect` reads saved run metadata;
`analyze` and `cut` operate offline but can prepare missing dependencies. They and
`retain`, `setup`, and `setup-qa` require the HTTP session stopped. A retained WAV
is not a run ID: inspect/analyze/cut need the current `out/runs/<id>` source.

Read the detailed report and listen when an audio-input tool is available.
Signal analysis finds active regions and rhythmic bass; CLAP ranks descriptions,
not correctness probabilities. Valid purrs can trigger rhythmic warnings and
short barks can rank as swishes. A favorable report has also accompanied
owner-rejected static. Never accept solely on a score or pick a region solely
because it ranks highest. Record the actual file/listening method and findings
when claiming listening evidence. If listening is unavailable, say so and keep
quality provisional; this does not stop unrelated work or add an owner gate.
Bound searches to **three generations per requested sound by default**, unless
the task sets another budget. Record unresolved warnings rather than retry forever.

Default `./run cut <run-id>` (empty options) selects region 1, adds short fades
and peak-normalizes to -3 dBFS. Region 1 can contain multiple events. No active
region is an explicit failure; inspect/listen and choose valid explicit bounds or
another candidate. Both `start_seconds` and `end_seconds` must select nonempty
samples within the actual source. The example's 0.2–0.6 bounds are illustrative.
Set `peak_db` from -30 to -3, or `normalize: false` to disable gain adjustment.
The CLI also accepts `./run cut <run-id> <start> <end>` in seconds. Source audio
and run metadata remain unchanged. Prepared exports retain stereo 44.1 kHz PCM16;
normalization sets headroom, not perceived loudness or the consuming project's mix.

`retain` verifies the prepared WAV and companions, then copies them into a fresh
`.runtime/retained/clip-*` directory and returns its `audio` path. Use this new
path afterward. Repeating retention creates another directory; it does not consume
the source. Copy the **entire retained directory** to a new destination in your
project: prepared WAV, `<cut-id>-source.wav` and `<cut-id>.json`. The JSON includes
hash-bound generation/cut settings, QA evidence, license references and provisional
review. Do not assemble or alter companions by hand. Validate the destination
before removing any source, using the existing verifier from the tool root:

```sh
node --input-type=module - /absolute/project/clip/<cut-id>.wav <<'JS'
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { verifyExport } from './export-lineage.mjs';
const audio = process.argv[2];
const record = JSON.parse(readFileSync(audio.replace(/\.wav$/, '.json'), 'utf8'));
verifyExport(record, readFileSync(audio), file => readFileSync(join(dirname(audio), file)));
console.log('Bundle verified');
JS
```

Use a new destination for each candidate; a partial copy is not success. Preserve
the verified source and repair/reverify the copy on failure. Automatic review stays
provisional; record an acceptance decision with actual listening evidence separately
in the consuming task. License/commercial eligibility is a separate decision;
neither QA nor listening grants rights.

## Storage and recovery

`out/` contains temporary runs, reports, work logs and bundles. Only the next
successfully initialized `make`/`start` session clears it, after acquiring the
port and verifying setup. Retain every candidate needed for comparison **before**
that next session. To preserve failed-run evidence without a completed export,
copy its complete run/work evidence to a deliberate durable location first;
`retain` only accepts prepared exports. The shared `make`/studio workflow now also
preserves candidates in `.runtime/studio/`; work logs and failed generations remain
temporary. The legacy manual service retains its temporary-session behavior.

`.runtime/` holds reusable environments, the runtime checkout, private token and
logs; `.runtime/retained/` survives subsequent sessions. Hugging Face caches and
copies in consuming projects also survive. Model downloads use the Hugging Face
hub cache (normally `~/.cache/huggingface/hub`, configurable with `HF_HOME` or
`HF_HUB_CACHE`); MLX files in `.runtime/official-sa3/` link to that cache, and
`.runtime/qa-model.json` records CLAP paths. Keep the same cache configuration
after setup. Generation subprocesses use `HF_HUB_OFFLINE=1`; CLAP loads local
files only. Explicit setup/repair still fetches runtime/package/model metadata
and may need network even when weight bytes are cached. Never clear unrelated output, caches
or retained candidates as a recovery shortcut. Do not start a session during
offline review. No service or model process should remain after completing work.

Explicit maintenance, with the service stopped:

```sh
./run setup
./run setup-qa
```

These prepare/repair the pinned generation and CLAP environments respectively.
Automatic setup progress is in `.runtime/setup.log`; manual startup also logs to
`.runtime/service.log`. Explicit setup writes progress to the terminal. Setup
fetches the pinned runtime, syncs exact dependency locks and reuses verified caches.
Revision/dependency mismatches require explicit repair. Hash mismatches or a changed
CLAP manifest are reported, not silently replaced: preserve and investigate the
named artifact before any targeted repair; do not remove all caches. Inspect
`out/work/mlx-job-*/inference.log`, `export.log` and run/QA records on job failure.
Record created environments, downloads and retained/copied paths as they happen,
including verification and cleanup state so a retry does not duplicate work.

Use `./run stop` to drain accepted work and `./run status` to verify shutdown.
Do not kill an unrelated port owner. Owned-backend recovery checks process identity
before signaling stale processes. Preserve failure evidence before starting over;
a failed/interrupted result is not a completed candidate.

## Manual HTTP session

```sh
./run start
./run status
# Perform authenticated requests, then:
./run stop
```

`start` prepares missing MLX **and CLAP** components and waits up to 20 minutes
for readiness. `serve` is its foreground counterpart. The API binds only
`127.0.0.1:8766`. Manual sessions shut down after **30 seconds idle** with no
active generation/QA; health polling does not keep them alive. Allow 10 minutes
for generation responses. Stop requests acknowledge `stopping` and drain accepted
work before exit; the CLI waits for shutdown. Disconnection does not cancel an
accepted generation. New work is refused while stopping.

Every endpoint, including health and downloads, requires
`Authorization: Bearer <private-token>` from `.runtime/token`. Any nonempty
`Origin` header is rejected (403); absent/wrong authentication returns 401. Do not
print the token, put it in URLs, logs or shell command arguments, or use verbose
HTTP tracing. For example, this reads it only into a Python process and prints
health JSON, not the header (illustrative client snippet, not a recorded live
Python-client check; run after `start`):

```sh
python3 - <<'PY'
import pathlib, urllib.request
request = urllib.request.Request('http://127.0.0.1:8766/health', headers={
    'Authorization': 'Bearer ' + pathlib.Path('.runtime/token').read_text().strip()
})
with urllib.request.urlopen(request, timeout=600) as response:
    print(response.read().decode())
PY
```

POST generation/QA bodies require `Content-Type: application/json`, valid JSON
and strict schema fields; the body limit is 16 KiB. Invalid JSON/schema/key returns
400, oversized bodies 413, wrong media type 415, unknown routes/results 404.

| Method and endpoint | Result |
| --- | --- |
| `GET /health` | ready/generating/processing/unavailable, active run ID/progress; 503 when unavailable/starting |
| `POST /v1/sound-effects` | Request JSON → original WAV, `X-Run-Id`, metadata `Location` |
| `GET /v1/runs/<id>` | Run metadata/status |
| `GET /v1/runs/<id>/audio` | Completed original WAV |
| `POST /v1/runs/<id>/analyses` | QA JSON → detailed report and `Location` |
| `GET /v1/runs/<id>/analyses/<analysis-id>` | Saved analysis report |
| `POST /v1/runs/<id>/cuts` | `{}` or cut options → prepared WAV, metadata `Location`, `X-Audio-Path` |
| `GET /v1/runs/<id>/cuts/<cut-id>` | Cut report including portable `delivery` paths |
| `GET /v1/runs/<id>/cuts/<cut-id>/audio` | Completed cut WAV |
| `POST /shutdown` | Acknowledge stopping, drain accepted work, exit |

The analyses `/audio` suffix has no completed cut audio and returns 409. Failed
operations can return 502; inspect the saved report. No-region default cuts return
422. A downloaded WAV alone is not the portable bundle; use the cut metadata's
`delivery.audio` with offline `retain` after stopping.

Generation accepts an optional `Idempotency-Key` of 1–128 letters, digits, `_` or
`-`; omission generates a new key. Within this session, the same key and request
waits for/retrieves the same run; a different request with that key returns 409.
A failed/interrupted run requires investigation and a new key for regeneration.
Persist your chosen key before sending; after a disconnect retry the same request
and key, not a new generation. Run IDs are 32 lowercase hexadecimal characters.
Analysis/cut IDs derive from source bytes, options, settings and implementation.
Successful operations reuse their saved result. Repeating a cut refreshes its
portable bundle with current analyses without regenerating audio; earlier bundles
stay unchanged. Use the returned path to retain the refreshed bundle. After fixing
a failure, repeat the same analysis/cut request: failed or interrupted attempts
(including failed CLAP analysis) are preserved in sibling `<id>-attempt-*`
directories before retrying. These remain temporary and are cleared with `out/`
at the next session.

Only one generation or QA operation runs at once. On **429**, honor `Retry-After: 1`
and retry after waiting, preserving the generation key and exact body. Check
health/progress of accepted work within the operation's deadline rather than
starting duplicate work. The CLI surfaces HTTP errors; it does not automatically
retry 429. Idempotency and run/result IDs are **session-scoped**, not a durable
archive: the next successful startup clears their output even if a key could
produce the same ID. Stop and retain before starting again.

For model-free checks, see [fixture instructions](../readme.md#fixture-checks) and
[portable export evidence](tasks/m01/04-portable-export-checks.md). The local studio
service below provides browser history and playback. `pnpm audio:smoke` runs two real default-CLAP jobs,
retains both candidates and checks output/session cleanup; task 08 records its
successful run. It writes `.runtime/smoke-*.json` and creates new output, so retain
wanted work first and reuse existing evidence when inputs are unchanged.

## Local studio service

Run `./run studio` and open **http://127.0.0.1:8767**. The server starts without
loading models and remains available for history, native playback and verified
bundle downloads after compute exits. Ctrl-C stops owned work and closes the
studio; `status`/`stop` still address the legacy temporary service on port 8766.
The listening workspace accepts prompts, constraints, event count, duration and
manual or automatic review with attempt/time budgets. Draft inputs survive refresh. Choose a take to play
its original/prepared audio, compare, save a separate adjusted cut, and approve
or reject with reasons. Feedback success follows persistence; export downloads
the verified complete TAR. Blind review hides automatic evidence. Delivered clips receive the experimental Larger CLAP General score/signal policy.
Prepare QA before using automatic mode; a missing judge stops for review.
Keep offline maintenance sequential with studio work.

`make`/`generate` and studio jobs use `workflow.mjs`: setup, generation, source
preservation, QA, cut and verified bundle preservation. `make` keeps its existing
result fields and adds `candidate_sha256`. Jobs, selected seeds, progress,
candidates and immutable feedback persist under `.runtime/studio/`, outside
`out/`. One workflow owner and one compute job are allowed; when the studio is
open, agents submit to its API instead of launching another `make`. Both public
studio and temporary compute ports must be free; unrelated listeners are never
terminated. Setup allows 20 minutes, generation 10 minutes, and QA/cut retain
their configured operation deadlines. Cancellation persists `canceling`, stops
owned generation/setup and drains accepted QA before `canceled`.

The browser bootstraps with `GET /studio/session` and `X-Studio-Bootstrap: 1`.
It receives an HttpOnly, SameSite=Strict cookie and a JSON `csrf` value. Mutations
require the exact Origin `http://127.0.0.1:8767`, that cookie, and
`X-Studio-CSRF: <csrf>`. Every studio route validates the exact Host. There is no
CORS allowance. Non-browser clients can use the existing private bearer token
instead, with no Origin header. Never put that token in browser code, URLs or
logs. Sessions expire after 12 hours; reload bootstraps a new session without
losing durable jobs or feedback.

| Method and endpoint | Result |
| --- | --- |
| `POST /studio/jobs` | `{ "mode": "automatic", "request": <generation request>, "qa": <optional QA request>, "budget": {"attempts": 3, "minutes": 20} }`; required `Idempotency-Key`; returns 202 and durable job immediately |
| `GET /studio/readiness` | Local generation presence and QA setup progress; explicit QA setup verifies the selected judge |
| `GET /studio/jobs` or `/studio/jobs/<job-id>` | Persisted request, outcome, attempt seeds/reasons, status/progress, candidate IDs, result/error |
| `POST /studio/jobs/<job-id>/cancel` | `{}`; stop/drain owned work; repeated cancellation is safe |
| `POST /studio/jobs/<job-id>/resume` | `{}` with a **new** `Idempotency-Key`; explicitly authorize a new attempt after canceled/failed/interrupted work |
| `POST /studio/jobs/<job-id>/retry` | Explicit new seed within the persisted budget; new idempotency key, same key reattaches |
| `POST /studio/jobs/<job-id>/recover` | `{}`; resume verified checkpoints under the same ID; uncertain operations stop without replay |
| `POST /studio/jobs/<job-id>/continue` | `{ "budget": {"attempts": 3, "minutes": 20} }` and a new idempotency key; record additional budget and a linked continuation |
| `POST /studio/jobs/<job-id>/acknowledge` | Explicitly acknowledge an interrupted, uncertain outcome without generation; preserve evidence and allow a new request |
| `POST /studio/candidates/<sha256>/cut` | Existing cut request semantics; preserve a new candidate with separate feedback and a fresh delivered-clip evaluation when the parent was evaluated |
| `GET /studio/candidates` or `/studio/candidates/<sha256>` | Verified immutable candidates, including source-only evidence |
| `GET /studio/candidates/<sha256>/source` or `/audio` | Registered WAV bytes; native single-range playback supported |
| `GET` / `POST /studio/candidates/<sha256>/feedback` | Read history / append an immutable human feedback event |
| `GET /studio/candidates/<sha256>/export` | Verified TAR containing prepared WAV, original WAV, portable JSON, candidate record and feedback history; source-only candidates return 409 |

JSON mutations retain the 16 KiB body bound. Idempotency keys contain 1–128
letters, digits, `_` or `-`. Repeating the same key/body returns the same durable
job, including after restart; conflicts return 409 and contention returns 429.
There is no queue. Automatic mode retries only judged rejection within the selected budget. Restart records unfinished work as
`interrupted` and refuses new generation until explicit resume or acknowledgement. Resume records
its new attempt identity before launch; retry that same resume key on disconnect.
Completed sources left before candidate publication are rescued before another
workflow clears temporary output. Persistence failures stop further cleanup.

Feedback bodies use the store contract: `event_id` (32 lowercase hex),
`candidate_sha256`, `supersedes` (null or previous event ID), `actor: "human"`,
`verdict: "accepted" | "rejected"`, `reason_tags` and `note`. Supported tags are
`wrong_sound`, `extra_events`, `background_noise`, `artifacts`, `bad_trim`, `other`.
Identical events are idempotent; stale/conflicting updates return 409. Playback
never creates a human label. Source-only snapshots remain separate immutable
records from delivered cuts. Human decisions override which take you select/export without changing automatic verdict history.

Studio budgets allow 1–10 total attempts and 1–60 wall-clock minutes, starting
after the first setup. Manual listening time counts toward that deadline;
accepted QA drains safely if the deadline expires. Retrying or resuming a
budgeted request cannot reset its budget. Use the explicit continuation action to record additional budget and retain the parent request link.
Cut adjustment uses isolated temporary output, preserves the original and prior
feedback, and drains before studio shutdown.

For CLI automation with the studio stopped, use `./run workflow workflow.json my-durable-key`.
The JSON has the same shape as `POST /studio/jobs`; for example:

```json
{"mode":"automatic","request":{"prompt":"A short wooden knock","duration_seconds":1},"budget":{"attempts":3,"minutes":20}}
```

Keep the key and input unchanged when reconnecting. The command prints the durable
job, including `outcome`: `auto_accepted`, `rejected` (manual mode), `needs_review`,
`exhausted`, `cancelled`, or `operational-error`. Automatic defaults are three
attempts and 20 minutes after initial setup; each judge has a 120-second deadline.
Generation intent stays fixed and every new seed is persisted before launch.
A trim-related verdict tries at most one alternate detected region or a cut
expanded by 100 ms on each side. Every delivered derivative is preserved before
judging; neither region choice nor highest similarity grants acceptance.
Uncertainty, unavailable QA and operational failures never trigger another generation.
After restart, use `recover` to reuse completed source/cut/judge evidence; an
in-flight operation without a verified result remains unresolved. Persisted
cancellation stays cancelled. `make`/`generate` retain their single-attempt interface.


Task 07's [integrated verification](tasks/m02/07-integrated-verification.md#evidence)
binds this workflow to current runtime/model hashes. Its real request stopped
at `needs_review`; browser playback did not create a human label. The feedback
check used a separate `fixture: true` copy of the real candidate, with a synthetic
note, so evaluation excludes it. Do not submit agent-created test feedback on a
real candidate: the store's synthetic exclusion is at candidate level.
The complete studio TAR includes `candidate.json` and `feedback.json` in addition
to portable audio lineage; preserve all files after extraction.
