# Audio Factory

A local sound-effect tool for developers and coding agents: describe a sound, generate it on an Apple Silicon Mac, review advisory QA, and take away a WAV with its generation and processing history. No game workspace or assets are required.

**Powered by Stability AI.** See [third-party notices and exact artifact terms](THIRD_PARTY_NOTICES.md).

**Status: standalone installation and two real MLX/CLAP jobs verified.** The [clean setup](docs/tasks/m01/07-fresh-installation.md#evidence) and [smoke evidence](docs/tasks/m01/08-real-job-smoke.md#evidence) cover setup, normalized export, retention, relocation and shutdown. Listening quality remains provisional. Third-party notices and the prospective source inventory are verified in tasks 10–11. Source-distribution readiness is blocked only on the owner-authorized software license in task 12; nothing has been published.

## Install and generate

Use an existing source checkout and run commands from its root. Generation requires **Apple Silicon macOS with Metal**, Node >=22.11, pnpm 9.15.9, uv, Python 3, Git and FFmpeg on PATH. Verified on an M4 MacBook Pro with 32 GB RAM, macOS 26.6.2/Metal 4, Node 22.22.3, pnpm 9.15.9, uv 0.10.11, Git 2.49.0, FFmpeg 9.0.1 and bootstrap Python 3.14.4. Setup uses Python **3.11.15** in both pinned environments; the check reused an existing global interpreter. These are tested versions, not a tested minimum hardware specification.

First use needs access to GitHub, Hugging Face, npm and Python package sources. Check free space in both checkout and cache locations and ensure port 8766 is free of another session. Setup enforces a 3 GiB free-space floor, but the measured complete setup occupied **4.09 GiB**, including caches; allow additional room for audio and installation work. Cold setup took **104.50 seconds** (69.49 s generation setup + 35.01 s CLAP setup) on the recorded machine/network. Other machines and networks can take longer.

```sh
./run setup
./run setup-qa
./run make examples/request.json
./run status
```

The launcher installs missing Node dependencies using the frozen lockfile and builds locally. The first two commands explicitly prepare the pinned Stable Audio 3 MLX and optional CPU CLAP components; `make` also prepares missing components automatically. This request asks for a five-second wood knock with seed 111. `generate` is an alias. For signal-only QA, pass `examples/qa-signal.json` as the second file; see the [examples](examples/readme.md).

`make` generates, analyzes, cuts region 1 with short fades and peak normalization to **-3 dBFS**, then shuts down. It prints JSON with `id`, prepared `audio`, advisory `qa` and detailed `report` path; `status` then reports `stopped`. The two recorded jobs took 8.765 s and 5.845 s with setup already present, returning stereo 44.1 kHz PCM16. These are observations, not performance guarantees.

Review before another job. The commands below are **illustrative templates**: replace `<run-id>` and `<audio-path>` with fields returned by `make`; do not type angle brackets literally.

```sh
./run inspect <run-id>
./run retain <audio-path>
```

Read the report and listen where possible. Retention returns a new WAV path under `.runtime/retained/clip-*`. Copy that **entire directory** into your project: prepared WAV, original source WAV and JSON companion. Follow the [usage guide's review, cut and destination verification instructions](docs/usage.md#review-adjust-and-retain-before-retrying) before removing any source.

This sequence is supported by task 07's root setup output and task 08's two `make` calls plus offline inspect/retain/status output through the same CLI. Template paths vary per job. The [usage guide](docs/usage.md) covers manual HTTP access, logs and repair; the [agent skill](.agents/skills/audio-factory/SKILL.md) covers bounded review and delivery from another project.

## Lifetime and limitations

- **Temporary output:** the next successfully initialized `make` or `start` clears `out/`, after setup and port acquisition. Retain every wanted candidate before retrying. Retained bundles, environments, caches and project copies survive. There is no automatic archive.
- **Local generation:** inference and QA use local weights without cloud inference. Initial setup/downloads need network; later jobs reuse verified local components. Explicit setup/repair can still contact remote sources. The backend is pinned MLX Small-SFX F16, F32 SAME-S decoder and F16 T5Gemma, eight steps, zero extra duration padding.
- **Advisory quality:** CLAP similarity and signal checks do not establish prompt accuracy or listening acceptance. Region 1 may contain multiple events. No listener evaluated the two standalone smoke candidates; both remain provisional. Default searches stop after **three generations per requested sound** unless another budget is specified.
- **Platform:** generation is supported on Apple Silicon macOS only. Linux instructions below cover model-free fixtures; they are not Linux generation support or evidence of a Linux run. Intel Macs and Windows generation are unsupported. There is no browser UI.
- **Recovery:** inspect `.runtime/setup.log` for automatic setup, `.runtime/service.log` for manual startup, and `out/work/mlx-job-*/inference.log`/`export.log` for jobs. Check `./run status`; use `./run stop` to drain an owned session. Repair with explicit `setup`/`setup-qa` while stopped, preserving and investigating mismatched artifacts. See [storage and recovery](docs/usage.md#storage-and-recovery).
- **Rights:** third-party attribution and artifact terms are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); no project software license has been authorized; [task 12](docs/tasks/m01/12-license-and-release-readiness.md) records the missing owner decision covering copied source and standalone additions. Model and generated-output rights are separate from the software license and quality review. Bundle license references alone do not grant rights. No weights are intended in the source distribution.

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
uv venv --python 3.11.15 .runtime/mlx-venv
uv pip sync --python .runtime/mlx-venv/bin/python <(rg '^(numpy|soundfile|cffi|pycparser|typing-extensions)==' requirements.lock)
pnpm build
pnpm test:audio-factory
```

Use this minimal environment setup only before installing the full generation
environment: syncing this subset into an existing full environment removes its
other packages. If full setup is already installed, use that environment directly.
The suite removes its own temporary runs and retained/copied fixture bundles.
Run it with no manual service active. The setup recipe and suite have supporting
[fixture evidence](docs/tasks/m01/04-portable-export-checks.md#evidence); task 08
also passed all seven Node and two Python checks on the full environment.

Optional supported-Mac regression command (two new real jobs):

```sh
pnpm audio:smoke
```

Task 08 records its successful output. It retains both candidates, verifies
next-session cleanup and stopped processes, and records `.runtime/smoke-*.json`.
Retain any existing wanted output first. Do not rerun smoke just to read or
validate existing evidence; it clears temporary output and creates new candidates.
