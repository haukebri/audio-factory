# Audio Factory

A local sound-effect tool for developers and coding agents: describe a sound, generate it on an Apple Silicon Mac, review it in a local browser studio with experimental automatic QA, and take away a WAV with its generation and processing history. No game workspace or assets are required.

**Powered by Stability AI.** See [third-party notices and exact artifact terms](THIRD_PARTY_NOTICES.md).

**Status: Medium GGUF F16 generation and studio integration verified; quality_not_established.** The [M2 migration evidence](docs/tasks/m02/08-medium-gguf-generation.md#evidence) covers exact models/build, real browser generation and delivered-audio judging, playback, mixed historical/new bundles, export, restart and process cleanup.

**Historical standalone installation and two real MLX/CLAP jobs verified.** The [clean setup](docs/tasks/m01/07-fresh-installation.md#evidence) and [smoke evidence](docs/tasks/m01/08-real-job-smoke.md#evidence) cover setup, normalized export, retention, relocation and shutdown. Listening quality remains provisional. Third-party notices and the prospective source inventory are verified in tasks 10–11. Source-distribution readiness is marked complete following the owner’s confirmation of license availability in task 12; nothing has been published.

## Install and generate

Use an existing source checkout and run commands from its root. Generation requires **Apple Silicon macOS with Metal**, Node >=22.11, pnpm 9.15.9, uv, Python 3, Git, curl and FFmpeg on PATH. Verified on an M4 MacBook Pro with 32 GB RAM, macOS 26.6.2/Metal 4, Node 22.22.3, pnpm 9.15.9, uv 0.10.11, Git 2.49.0, FFmpeg 9.0.1 and bootstrap Python 3.14.4. Setup uses Python **3.11.15** for build, signal and QA environments; the check reused an existing global interpreter. These are tested versions, not a tested minimum hardware specification.

First use needs access to GitHub, Hugging Face, npm and Python package sources. Generation setup downloads **5,754,163,808 bytes** of pinned models and requires those missing bytes plus **5 GiB build/cache reserve**. Install Xcode (including its Metal compiler); setup uses `/Applications/Xcode.app/Contents/Developer` when available without changing the system developer selection. It installs pinned CMake 4.1.0 in a private build environment. Allow up to 60 minutes for downloads and 30 minutes for the build; progress and partial downloads are preserved. See [Medium verification](docs/tasks/m02/08-medium-gguf-generation.md#evidence) for measured resources and limitations.

```sh
./run setup
./run setup-qa
./run make examples/request.json
./run status
```

The launcher installs missing Node dependencies using the frozen lockfile and builds locally. The first two commands explicitly prepare the pinned Stable Audio 3 Medium GGUF F16 and optional CPU CLAP components; `make` also prepares missing components automatically. This request asks for a five-second wood knock with seed 111. `generate` is an alias. For signal-only QA, pass `examples/qa-signal.json` as the second file; see the [examples](examples/readme.md).

`make` generates, analyzes, cuts region 1 with short fades and peak normalization to **-3 dBFS**, then shuts down. It prints JSON with `id`, prepared `audio`, advisory `qa` and detailed `report` path; `status` then reports `stopped`. Delivery remains stereo 44.1 kHz PCM16. Historical MLX timings do not describe the Medium backend.

Review before another job. The commands below are **illustrative templates**: replace `<run-id>` and `<audio-path>` with fields returned by `make`; do not type angle brackets literally.

```sh
./run inspect <run-id>
./run retain <audio-path>
```

Read the report and listen where possible. Retention returns a new WAV path under `.runtime/retained/clip-*`. Copy that **entire directory** into your project: prepared WAV, original source WAV and JSON companion. Follow the [usage guide's review, cut and destination verification instructions](docs/usage.md#review-adjust-and-retain-before-retrying) before removing any source.

Historical M1 setup/smoke and current M2 Medium integration evidence are linked above. CLI and studio use the same generation/QA workflow. Template paths vary per job. The [usage guide](docs/usage.md) covers manual HTTP access, logs and repair; the [agent skill](.agents/skills/audio-factory/SKILL.md) covers bounded review and delivery from another project.

## Review studio

Run `./run setup` and `./run setup-qa`, then `./run studio`; open **http://127.0.0.1:8767**. Keep both 8766 and 8767 free. The studio retains candidates, supports original/prepared playback, blind review, explicit human feedback and complete bundle downloads. Automatic mode defaults to three attempts and 20 minutes after setup; scores below the 0.30 acceptance threshold trigger retries within that budget. Inconclusive margins or unavailable QA stop for review. Before generation, one local Ollama call (`gemma4:latest`) prepares three prompt variants and one fixed QA description. Retries rotate through those variants; your original intent stays saved. Prompt preparation has a two-minute deadline and falls back to the original wording if unavailable; no model is downloaded automatically. Ctrl-C closes the studio and owned work. Agents use the same durable workflow; see [studio/API instructions](docs/usage.md#local-studio-service) and [feedback evaluation](docs/evaluation.md).

The redesigned studio uses **Create** and **Library**, with Settings and Evaluation tools under **More**. See the [studio guide](docs/studio.md) for fresh takes, exact versions, comparison, trimming and recovery, and the [UI verification record](docs/plans/studio-ui-verification.md) for browser and accessibility evidence.

The selected Larger CLAP General checkpoint adds 779,810,876 cached artifact bytes; QA setup requires those bytes plus 10 GiB reserve. Its isolated Python 3.11.15 environment uses the pinned QA lock. Reuse existing caches and allow up to 45 minutes for initial QA setup; each delivered-clip judge has a 120-second deadline. Historical setup timings above used the older M1 CLAP checkpoint.

## Lifetime and limitations

- **Temporary output:** the next successfully initialized `make` or `start` clears `out/`, after setup and port acquisition. Retain every wanted candidate before retrying. Retained bundles, environments, caches and project copies survive. The shared `make`/studio workflow also preserves immutable candidates under `.runtime/studio/`; raw work logs in `out/` remain temporary.
- **Local generation:** inference and QA use local weights without cloud inference. Initial setup/downloads need network; later jobs reuse verified local components. Explicit setup/repair can still contact remote sources. The backend is pinned sa3.cpp/Metal with Medium DiT F16, SAME-L F16, conditioner F32, T5Gemma F32 and its tokenizer. Eight steps and zero extra duration padding are explicit Medium settings; no quantized, MLX or CPU fallback is accepted.
- **Advisory quality:** CLAP similarity and signal checks do not establish prompt accuracy or listening acceptance. Region 1 may contain multiple events. No listener evaluated the two standalone smoke candidates; both remain provisional. Default searches stop after **three generations per requested sound** unless another budget is specified.
- **Platform:** generation is supported on Apple Silicon macOS only. Linux instructions below cover model-free fixtures; they are not Linux generation support or evidence of a Linux run. Intel Macs and Windows generation are unsupported. The review studio is a local browser UI.
- **Recovery:** inspect `.runtime/setup.log` for automatic setup, `.runtime/service.log` for manual startup, and `out/work/gguf-job-*/inference.log`/`export.log` for jobs. Check `./run status`; use `./run stop` to drain an owned session. Repair with explicit `setup`/`setup-qa` while stopped, preserving and investigating mismatched artifacts. See [storage and recovery](docs/usage.md#storage-and-recovery).
- **Rights:** third-party attribution and artifact terms are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the owner confirmed license availability and resolved the licensing blocker in [task 12](docs/tasks/m01/12-license-and-release-readiness.md). This status update adds no license text or new grant of rights. Model and generated-output rights are separate from the software license and quality review. Bundle license references alone do not grant rights. No weights are intended in the source distribution.

## Project documents

- [Incremental build tasks](docs/tasks/m01/00-overview.md): ordered, reviewable tasks for `scripts/run_codex_tasks.py`, with preview and execution instructions.

- [Project overview](docs/project-overview.md): scope, current source behavior, extraction boundaries, and completion criteria.
- [Milestone 1 — Standalone core](docs/milestone/01-standalone-core.md)
- [Milestone 2 — Portable workflow](docs/milestone/02-portable-workflow.md)
- [Milestone 3 — Standalone verification](docs/milestone/03-standalone-verification.md)
- [Milestone 4 — Distribution readiness](docs/milestone/04-distribution-readiness.md)

## Fixture checks

The extracted service, QA and portable-bundle checks use deterministic audio and
FFmpeg, without generation or CLAP model downloads. Prepare only the pinned signal
packages in a separate checkout (Linux fixture instructions; only macOS execution
is recorded). Have Node, pnpm, uv, FFmpeg and ripgrep (`rg`) available. Run from
the tool root with Bash or Zsh:

```sh
pnpm install --frozen-lockfile
uv venv --python 3.11.15 .runtime/signal-venv
uv pip sync --python .runtime/signal-venv/bin/python signal-requirements.lock
pnpm build
pnpm test:audio-factory
```

The signal environment contains the same pinned packages used by generation setup;
CLAP remains in its separate QA environment. Historical MLX environments are preserved.
The suite removes its own temporary runs and retained/copied fixture bundles.
Run it with no manual service active. The setup recipe and suite have supporting
[fixture evidence](docs/tasks/m01/04-portable-export-checks.md#evidence); task 08
also passed all seven Node and two Python checks on the full environment.

Optional supported-Mac regression command (two new real jobs):

```sh
pnpm audio:smoke
```

Historical M1 task 08 records the MLX version of this command; M2 task 08 uses
a bounded real Medium studio journey. The command retains both candidates, verifies
next-session cleanup and stopped processes, and records `.runtime/smoke-*.json`.
Retain any existing wanted output first. Do not rerun smoke just to read or
validate existing evidence; it clears temporary output and creates new candidates.
