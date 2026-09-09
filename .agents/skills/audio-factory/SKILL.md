---
name: audio-factory
description: Generate local sound effects with the standalone Audio Factory, evaluate signal and CLAP reports, and retain portable normalized clips with generation and review provenance. Use when a development task needs a new or replacement sound effect.
---

# Audio factory

Check existing assets first. Locate the Audio Factory checkout before running
commands: from this skill's location its root is `../../..`, containing
[run](../../../run), [package.json](../../../package.json) and
[examples](../../../examples/readme.md). In another project, use the checkout path
provided by that project's instructions or the user; do not assume this skill is
automatically discovered there. If no path is known, locate the existing checkout
or ask for its location. Run from the tool root, or invoke its absolute `run` path
with absolute request paths: the launcher changes working directory to its root.
Keep the consuming project's destination separate from temporary tool output.

The [usage guide](../../../docs/usage.md) owns API/authentication, setup, schemas
and recovery details. This is a local developer tool: first-use setup needs
network; installed generation and QA use local weights. The guide links verified
clean setup and two real jobs (tasks 07–08), tested versions and storage/timing
observations. Neither smoke nor source listening history establishes acceptance
of a new candidate. Software release/licensing remains pending through task 12;
model/output rights remain separate.

## Generate and evaluate

Preflight Apple Silicon macOS, Node >=22.11, pnpm, uv, Python 3, Git, FFmpeg,
network/download access, disk space and port ownership as described in the guide.
The normal operation is one temporary job, from the tool checkout:

```sh
./run make examples/request.json examples/qa-signal.json
```

`generate` is an alias. The launcher installs missing project dependencies and
compiles tooling. First use prepares pinned MLX components and missing weights;
later jobs reuse verified caches. Optional CLAP uses a separate CPU environment.
Setup can take several minutes; progress is in `.runtime/setup.log`. Allow the
20-minute automatic setup/manual startup wait and 10-minute generation deadline;
follow the same process and readiness/log evidence instead of duplicating a quiet
job. Generation, QA and normalized region-1 export complete before shutdown, even
on failure. Each model subprocess exits after its operation. The returned JSON
contains `id`, prepared `audio`, advisory `qa` and detailed `report` path.

Use `prompt`, `duration_seconds` and optional `seed` as in the linked examples.
Describe source/action/material and acoustic environment. Five-second canvases
have inherited source listening evidence; 0.5–30 seconds are supported. Request a
single dry event when needed, but do not assume the model obeyed the event count.
Keep the pinned MLX backend/settings; no alternative backend/cloud fallback. The
source's C++ variants produced duration-dependent static.

For semantic comparison pass `examples/qa-clap.json` instead. Supply a short
target and plausible unwanted alternatives. For a hiss, compare hissing with swish,
bark, static and helicopter. Without a QA file, `make` uses the first 200 prompt
characters and noise alternatives with CLAP enabled. `{"clap": false}` requests
signal-only QA and avoids CLAP setup. Missing CLAP is explicit, never a semantic
pass; available signal evidence survives analysis failure, but setup can fail first.

Read the detailed report before deciding whether to use the prepared candidate:

- Signal analysis identifies active regions and rhythmic bass. CLAP ranks supplied
  descriptions for the recording/regions; scores are not correctness probabilities.
  It neither rejects audio nor starts another generation.
- Investigate unexpected high-ranked content. Source cat-plus-swish examples really
  contained both. Choose explicit bounds if the boundary is established; otherwise
  try another seed or revise the prompt.
- Do not automatically discard rhythmic audio: valid purrs triggered this warning.
  Short isolated barks ranked as swishes. Avoid universal score thresholds and
  blindly selecting the highest-scoring region. Favorable QA has also accompanied
  owner-rejected static.
- Listen when an audio-input tool is available, recording the actual file, method
  and findings. Otherwise state the limitation and preserve provisional quality.
  Only owner listening or other actual listening evidence supports acceptance;
  CLAP alone is not listening acceptance.

Bound quality searches to **three generations per requested sound by default**;
a task may set another budget. Record evidence and limitations rather than loop
indefinitely. Missing listening tools do not stop unrelated work. Provisional
local use is authorized within the task's scope; this skill adds no human gate.

## Adjust and preserve

With the service stopped, substitute the returned run ID in these commands:

```sh
./run inspect <run-id>
./run analyze <run-id> examples/qa-signal.json
./run cut <run-id>
./run cut <run-id> examples/cut.json
./run retain <audio-path>
```

`make` already cuts region 1; use `cut` only to adjust the result. Analyze/cut work
offline but may prepare missing dependencies. Default cut selects **region 1**,
adds short fades and peak-normalizes to **-3 dBFS**. Region 1 can retain multiple
knocks or a hiss followed by a swish. Explicit `start_seconds`/`end_seconds` must
both fit the actual source; adjust the example's bounds after inspection. Options
also allow `peak_db` from -30 to -3 or `normalize: false`. No active region is an
explicit failure. Source WAV and run JSON remain immutable during the session.
The export is stereo 44.1 kHz PCM16; headroom is separate from perceived loudness
and the consuming project's mix.

Pass the prepared `audio` path from `make` or `cut` to `retain`, then use its
returned retained path. Retention verifies and copies the prepared WAV, original
WAV and JSON companion into a fresh `.runtime/retained/clip-*` directory. Repeating
it creates another copy. Copy that **whole directory** into the consuming project;
use the usage guide's existing `verifyExport` invocation to validate the destination
before removing any source. A partial copy is not success. Do not assemble or
edit companions manually. Generation settings/hashes, processing, QA and license
references travel with the sound; automatic review remains provisional. Record
your quality decision and unresolved warnings in the task report. Commercial
eligibility is separate from quality acceptance and model/license references.

## Recovery and verification

`out/` paths and run IDs last until the next successfully initialized `make` or
manual `start`, after setup and port acquisition. **Retain candidates needed for
comparison before the next session.** Review, adjust, retain and copy sequentially.
There is no automatic archive. Preserve failed run/work evidence separately when
no prepared export exists. Environments, verified caches, retained bundles and
project copies survive startup. Never run setup or an offline mutation during a
manual HTTP session. Saved retained bundles are durable delivery, not input IDs
for offline analyze/cut after their source session expires.

`./run status` should report stopped after `make`. Advanced/manual `start` has a
30-second idle shutdown; health polling does not extend it. `./run stop` drains
accepted work. Manual requests require private bearer authentication and reject
Origin headers; never print the token. On 429 wait `Retry-After: 1` and retry the
same request/key; the CLI itself surfaces the error. Keys and IDs are session-scoped.
Read the guide before manual API use, including disconnect/conflict recovery.

On setup failure inspect `.runtime/setup.log` (and `.runtime/service.log` for
manual startup). Use `./run setup` / `./run setup-qa` for explicit repair with the
service stopped. Preserve and investigate mismatched hashes/manifests instead of
silently replacing them. Never kill an unrelated process to free the port. Record
external changes and remaining verification immediately; reuse verified caches
and preserve wanted evidence before restarting.

`pnpm test:audio-factory` checks service, lifecycle, signal QA and portable lineage
with fixtures; see the [fixture prerequisites](../../../readme.md#fixture-checks).
There is no standalone browser UI. `pnpm audio:smoke` runs and retains two real
MLX/CLAP jobs and verifies session cleanup; retain wanted output first. Reuse the
guide's recorded smoke evidence when inputs are unchanged. Linux instructions
cover fixtures only, not generation. Real inference and technical checks do not
establish semantic acceptance. Leave no
factory/model process running when work is complete.
