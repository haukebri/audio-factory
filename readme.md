# Audio Factory

A local sound-effect tool for developers and coding agents: describe a sound, generate it on an Apple Silicon Mac, review advisory QA, and take away a WAV with its generation and processing history.

This project is a **lift and shift** of the working audio factory in Urban Wildlife. The first release will preserve its official Stable Audio 3 MLX backend, temporary job lifecycle, signal analysis, optional CLAP analysis, and normalized exports.

**Status: documentation and extraction plan.** The implementation has not been copied into this repository yet. The existing `scripts/` directory contains task-runner utilities, not the audio factory. There is no standalone installation command to run yet.

## Intended workflow

1. Supply a JSON request describing a sound, with optional duration and seed.
2. Run one job that prepares missing dependencies, generates audio, analyzes it, exports the first active region, and stops.
3. Review the report and listen where possible. Adjust the cut or try another generation when needed.
4. Retain the candidate before starting another job, then copy the complete portable bundle into your project.

A request looks like this:

```json
{
  "prompt": "One dry knock on a wooden door, close microphone, followed by silence",
  "duration_seconds": 5,
  "seed": 111
}
```

The planned root launcher is `./run make request.json [qa-request.json]`. This is a target interface, not an available command today.

## Requirements and limits

The source requires Apple Silicon macOS, Node (currently >=22.11 in the source project), pnpm, uv, Git, and FFmpeg. First use needs network access to install pinned environments and download models; subsequent jobs reuse local caches. Standalone versions and clean-install instructions will be verified during extraction. Linux can run selected fixture checks; it is not a supported generation backend.

QA is advisory. A valid WAV, a high CLAP score, or a clean signal report does not establish that the sound matches the prompt. The source has documented both useful results and false acceptance of static.

Outputs are temporary: the next successfully initialized session clears `out/`. Explicit retention preserves the WAV, original source, and metadata across jobs. Generation runs locally; there is no cloud inference fallback.

The planned distribution contains tool source, not model weights or game assets. A software license and applicable third-party notices must be settled before public release; this documentation does not grant model or generated-output rights.

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
packages (also suitable for Linux fixture checks; generation still requires Apple
Silicon). Run these commands from the tool root with Bash or Zsh:

```sh
uv venv --python 3.11.15 .runtime/mlx-venv
uv pip sync --python .runtime/mlx-venv/bin/python <(rg '^(numpy|soundfile|cffi|pycparser|typing-extensions)==' requirements.lock)
pnpm build
pnpm test:audio-factory
```

Use this minimal environment setup only before installing the full generation
environment: syncing this subset into an existing full environment removes its
other packages. If full setup is already installed, use that environment directly.
The suite removes its own temporary runs and retained/copied fixture bundles.
