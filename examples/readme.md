# Request and cut examples

Run commands from the Audio Factory checkout root, on a supported Apple Silicon
Mac with Node >=22.11, pnpm, uv, Git and FFmpeg available. The launcher builds the
tool and installs missing dependencies; generation can download pinned models on
first use. See the [verified setup guide](../readme.md#install-and-generate).
[Task 08](../docs/tasks/m01/08-real-job-smoke.md#evidence) used this request for
two real default-CLAP jobs and checked the signal-only analysis and bounded cut
offline. These examples do not establish listening acceptance.

[request.json](request.json) asks for a five-second wood knock with seed 111.
The [request validator](../request.schema.json) requires a nonblank prompt of
1–2000 characters. Duration is 0.5–30 seconds (default 3); the optional seed is an
integer from 0 to 2147483647. Asking for “one” knock does not guarantee one event:
a generated clip or its first active region can contain several knocks.

Start one job with [signal-only QA](qa-signal.json), which avoids CLAP setup:

```sh
./run make examples/request.json examples/qa-signal.json
```

Alternatively, choose [CLAP QA](qa-clap.json) for that job:

```sh
./run make examples/request.json examples/qa-clap.json
```

Choose one command initially; retain any wanted result before running the other.
CLAP runs on CPU and may install its separate environment and model. Its short
target and relevant alternatives are relative comparisons, not correctness
probabilities. The [QA validator](../qa.schema.json) allows descriptions of
1–200 nonblank characters and up to 16 alternatives; `clap: true` requires a
target. Omitting the QA file from `make` enables CLAP with the first 200 prompt
characters and static, helicopter and silence alternatives. QA stays advisory,
and missing CLAP is reported explicitly while preserving available signal evidence.

`make` returns JSON with `id`, prepared `audio`, a QA summary and `report`, and
shuts down on success or failure. Substitute its actual run ID below. Review
sequentially with the HTTP service stopped; `./run status` should report stopped.

```sh
./run inspect <run-id>
./run analyze <run-id> examples/qa-signal.json
./run cut <run-id> examples/cut.json
```

[cut.json](cut.json) selects 0.2–0.6 seconds and normalizes to -9 dBFS after short
fades. These illustrative bounds must fit the **actual generated source**, not
just the requested duration. Inspect the source duration and analysis regions,
listen where possible, then edit both bounds to select the wanted sound.
Both bounds are required together and must select nonempty samples within the
source. Invalid bounds fail; adjust them rather than weakening validation.

For the default cut, omit the file (equivalent to `{}`):

```sh
./run cut <run-id>
```

This selects region 1 with short fades and peak normalization to -3 dBFS.
No active region is an explicit failure. To disable normalization, replace the
contents of `examples/cut.json` with `{"normalize": false}` for region 1, or add
`"normalize": false` to the bounded example. Run the same file-based cut command.
Allowed `peak_db` targets are -30 to -3; the target is not applied when normalization
is off. Cuts preserve the original stereo 44.1 kHz PCM16 source.

After review, retain the chosen `audio` path returned by `make` or `cut`:

```sh
./run retain <audio-path>
```

`out/` holds temporary runs, reports and exports. It remains available after
shutdown, but the next successfully initialized `make` or `start` session clears
it, after setup succeeds and the service acquires its port. Review → adjust cut →
retain must happen **before retrying generation**, even for a failed attempt whose
evidence you want to keep. Do not start another session during offline review.
Retention copies the prepared WAV, original WAV and JSON companion into
`.runtime/retained/`, which survives subsequent sessions. Copy the entire retained
bundle directory into your project; the prepared WAV alone loses provenance.
Automatic review remains provisional, and neither these examples nor numerical
QA establish listening acceptance.

See the [storage contract](../docs/project-overview.md) for output lifetimes and
the [fixture instructions](../readme.md#fixture-checks) for checks without models.
