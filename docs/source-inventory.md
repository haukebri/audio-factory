# Source inventory — task 01

Extracted 2026-09-09 from `/Users/haukebrinkmann/Projects/urban-wildlife/assets-src/audio-factory/`. Source HEAD: `00d64d6cbf71bf0f9d35832784d7a9aa3ffe35aa`.

Source factory worktree differences (index/worktree status):

```text
MM assets-src/audio-factory/ambient-acceptance-browser.mjs
MM assets-src/audio-factory/ambient-acceptance.mjs
A  assets-src/audio-factory/cue-audition.mjs
```

These three game-check files were omitted. All copied inputs, the source root manifest/lockfile and TypeScript base configuration match HEAD; the source worktree was read only and never reset. No source operational state, audio, environments or model files were copied.

## Copied files

Paths are relative to each factory root. SHA-256 identifies original working bytes and destination bytes after task 01 adaptations.

| File | Original SHA-256 | Destination SHA-256 | Adaptation |
| --- | --- | --- | --- |
| `bundle.mjs` | `253515a5b7997b295379c0d8833558379424c93d3216bc9c1b9dbfddcf1d420f` | `253515a5b7997b295379c0d8833558379424c93d3216bc9c1b9dbfddcf1d420f` | Unchanged |
| `config.json` | `bac3498052b35e101ff582ad21a06f5bb12bb8f2bff995b4785f005dbfb0d1dc` | `bac3498052b35e101ff582ad21a06f5bb12bb8f2bff995b4785f005dbfb0d1dc` | Unchanged |
| `config.schema.json` | `c52a9e8fff9003add82a1779e74e376983616240e8a3ebe96fe2e1bcba668385` | `c52a9e8fff9003add82a1779e74e376983616240e8a3ebe96fe2e1bcba668385` | Unchanged |
| `download_models.py` | `d7736e2f95642082e682156b9c2b914466ef59afc3caab6dd369371dc11ab32f` | `d7736e2f95642082e682156b9c2b914466ef59afc3caab6dd369371dc11ab32f` | Unchanged |
| `export-lineage.mjs` | `a41b3c51363a4a9dff594032b6893920757d79f3aca5b12107246dadc3eab373` | `49e92152df8c40206119f1585e56af8b35baa5da5b5975d3fbeb909957915dcf` | Resolve Ajv directly from `ajv/dist/2020.js` |
| `export.schema.json` | `e2f54657dc02085663150db6a8247561a7c12fe16d1780b426a8b207341ef2d7` | `e2f54657dc02085663150db6a8247561a7c12fe16d1780b426a8b207341ef2d7` | Unchanged |
| `qa-config.json` | `2fb909fa8929b9ad23c1a6937439e388bbceb17461357fd64c271b94b91e7545` | `2fb909fa8929b9ad23c1a6937439e388bbceb17461357fd64c271b94b91e7545` | Unchanged |
| `qa-config.schema.json` | `1fcce8d7d468e4cd10f69f5cb6303d9868c1056cfdf1871540a20a7310177bc7` | `1fcce8d7d468e4cd10f69f5cb6303d9868c1056cfdf1871540a20a7310177bc7` | Unchanged |
| `qa-model.lock.json` | `a28643e40969ac223ed36a197c4590c9f3d3e073c7e30aab40415b282170b7eb` | `a28643e40969ac223ed36a197c4590c9f3d3e073c7e30aab40415b282170b7eb` | Unchanged |
| `qa-report.schema.json` | `ee59d7ac9166780508892628029ddab741e122bd33f8ee9daba7198964b08920` | `ee59d7ac9166780508892628029ddab741e122bd33f8ee9daba7198964b08920` | Unchanged |
| `qa-requirements.lock` | `1dc953bf9b14a297325dd307ef7e75401a80e8723bc51bfe958bc1a63498a42f` | `1dc953bf9b14a297325dd307ef7e75401a80e8723bc51bfe958bc1a63498a42f` | Unchanged |
| `qa-setup.py` | `22eaacf285b1a9edc7d0930dd10fdacdb944406f8aaa2bb9101190ebb8c5ec61` | `22eaacf285b1a9edc7d0930dd10fdacdb944406f8aaa2bb9101190ebb8c5ec61` | Unchanged |
| `qa.py` | `d9b063b31feb83ed83d23137cbabd430cd654c942d6dbf242872af14272ea042` | `d9b063b31feb83ed83d23137cbabd430cd654c942d6dbf242872af14272ea042` | Unchanged |
| `qa.schema.json` | `fe5b9917e35cfcf9e187c39f7318001aa133b248abe1157aa09735d22b8e0f62` | `fe5b9917e35cfcf9e187c39f7318001aa133b248abe1157aa09735d22b8e0f62` | Unchanged |
| `request.schema.json` | `860af00a788cacc5edaa240d162bcaef9d072c704f117a86bec51cf0eebbf795` | `860af00a788cacc5edaa240d162bcaef9d072c704f117a86bec51cf0eebbf795` | Unchanged |
| `requirements.lock` | `e38396e526d5e27cc5d4bd36d5802f876d82042b5a1a6ad3c77e74d24395cb3a` | `e38396e526d5e27cc5d4bd36d5802f876d82042b5a1a6ad3c77e74d24395cb3a` | Unchanged |
| `retain.mjs` | `99d0e7d527ee11d46a28e5093bf7ffac021e86945da30ab75cbd2f01501fc85b` | `99d0e7d527ee11d46a28e5093bf7ffac021e86945da30ab75cbd2f01501fc85b` | Unchanged |
| `review.schema.json` | `deadae956492b99d7a6404a062ecd0e7e3c6dfa76897ac313d6d935ae458bd83` | `deadae956492b99d7a6404a062ecd0e7e3c6dfa76897ac313d6d935ae458bd83` | Unchanged |
| `run.schema.json` | `2899b44ed47c426b283f54fbc942fdbeb4f8b4e29813c46dd1023ed3aadcebc6` | `2899b44ed47c426b283f54fbc942fdbeb4f8b4e29813c46dd1023ed3aadcebc6` | Unchanged |
| `setup.mjs` | `49001737d838292de04e18b513d9575151b59dbd11a2578f470aa4fde5b6b67f` | `544cfc3a4066dd1b82ab27f2be5c9b1cf036c0b2074038bf0e9022fbc29da322` | Resolve Ajv directly from `ajv/dist/2020.js` |
| `src/backend.ts` | `97796af9dacb98a61dfb2b928b1b629f6c39347140a5f4e932591b5c370a46e2` | `97796af9dacb98a61dfb2b928b1b629f6c39347140a5f4e932591b5c370a46e2` | Unchanged |
| `src/cli.ts` | `7ed120bd448c36e57d45e59142a91a214a9a0a5d8ad19a802644104925183bc9` | `4ed88bc072771a27a8179303c408ff02c2b5d4c92f81408a497e581f6271a6ca` | Remove game import dispatch and help; retain other commands |
| `src/config.ts` | `01ffdc1944d92453eb1a5e7c4258bfa02fa88785bf5a890a3e28510442c7b4af` | `06533b48577837f2b11691ba38681c1677d57205ab6271d637e48d87ea9eb811` | Resolve Ajv directly from `ajv/dist/2020.js` |
| `src/ownership.ts` | `ecb0c983fb87bac0ac383d89dfb71894c014bb524168ebbc4d255363561902c3` | `ecb0c983fb87bac0ac383d89dfb71894c014bb524168ebbc4d255363561902c3` | Unchanged |
| `src/qa.ts` | `7a3b220f1655855034ef3d2243639b10333f2ed5e71bb2425557bd26f6bd728d` | `c8a80c5ff1f41d6e894b2370bc79ebd930ca9c76a984b53d884efbfc6de6f38f` | Resolve Ajv directly from `ajv/dist/2020.js` |
| `src/service.ts` | `59bb32b772049cac55338d4d1ccf262d5fb9e04ddfe22dcf5641bfa24f241937` | `59bb32b772049cac55338d4d1ccf262d5fb9e04ddfe22dcf5641bfa24f241937` | Unchanged |
| `src/setup.ts` | `befde3b47d1437c65d44228655d6bbb3455c6ee1d4b194cc8c4009c05b4e4e05` | `befde3b47d1437c65d44228655d6bbb3455c6ee1d4b194cc8c4009c05b4e4e05` | Unchanged |
| `src/wav.ts` | `8c05bb2b7bbbc05a6e6a58862fae24898f7c3db219ea250cec9cab54961f2bb1` | `8c05bb2b7bbbc05a6e6a58862fae24898f7c3db219ea250cec9cab54961f2bb1` | Unchanged |
| `tsconfig.json` | `5cb09b2e1fc46d18a402020725e92db3d268c7c4211e2427ca784c9a2e1bd0c4` | `ef0ab570d0667846a6de6dae5c2b65ffae46765bcdc4d0f1e98930dd26530e11` | Inline source base compiler options; preserve factory overrides |

## Packaging inputs

| Source repository file | Original SHA-256 | Treatment |
| --- | --- | --- |
| `package.json` | `21eb4520fd386d366686d9eab066a4c902dd253a260f78d0f75d01d7026af941` | Standalone private ESM package; source Node engine and pnpm version; only build and audio:factory scripts, TypeScript and Node types; retain applicable fast-uri override |
| `pnpm-lock.yaml` | `4ecb0c67013f44fb81d4034eed27c4852d7947c97e4cf50f9c2532dd8d4eca83` | Subset only: Ajv, TypeScript, Node types and their complete dependency/optional-platform closure; source versions and integrity values unchanged |
| `tsconfig.base.json` | `a51e1f466373bdf6dbb175c7d2348e5ac5075d8688a823f864f2643a9550d500` | Inline compiler options into root tsconfig.json |
| `packages/content-schema/package.json` | `3d71425a470d8661b0ed54768acc59d9ca24d8377957e7c034154dec29bc1e90` | Use its exact Ajv 8.18.0 dependency directly |

New standalone `package.json` SHA-256: `a34f00d3cdfd5d9415247ef4831241ef53979a976bd13f8b453fd4e84f22cc15`. Standalone `pnpm-lock.yaml` SHA-256: `12a4164a82fff196d3802096274a083e78f141a61153d1334f054ce7ba1e439e`. `.gitignore` is new; the baseline tracked `.DS_Store` is removed. Existing scripts and documentation are preserved except task evidence/status and supported milestone acceptance.

## Preserved settings and boundary

`config.json`, every schema, both Python locks, QA settings/model lock, backend, signal analyzer and download scripts are byte-identical. This preserves runtime `779434a908193105335fd8d833418603625b2859`, model revision `da6edc54ddba10bfd79a077102ded687f80e882b`, all three artifact hashes/sizes, Python 3.11.15, Small-SFX F16 / SAME-S F32 / T5Gemma F16, eight steps, zero padding, -3 dB attenuation, stereo 44100 Hz PCM16, QA thresholds and schema identifiers. No model verification by download or inference is claimed.

All CLI runtime helpers are present: setup.mjs → download_models.py, qa-setup.py, qa.py, bundle.mjs → export-lineage.mjs, and retain.mjs → export-lineage.mjs. The source launcher is read but deferred to task 02, as is the obsolete setup progress diagnostic in src/setup.ts. Game import/builders/loop conversion, browser checks, audition/experiment helpers, pilot assets and operational state are omitted. Source regression suites and fixtures remain for tasks 03–04.


## M2 integration inventory — task 07

The tables above describe extraction-time bytes, not current implementation
hashes. The [integration evidence](tasks/m02/07-integrated-verification.md#evidence)
records the current input revision and full tracked-file SHA-256 manifest.
Current standalone additions are `workflow.mjs` (durable bounded jobs),
`review-store.mjs` (immutable assets/feedback), `studio.mjs`, `studio.html`,
`studio.js`, `studio.css` (local service/workspace), `judge.mjs` and
`judge-policy.json` (experimental delivered-audio policy), and `evaluation.mjs`
(cached benchmark/policy comparison). Their focused tests are source checks;
`judge-smoke.mjs` is a controlled retained-audio replay, not generation evidence.
`docs/tasks/m02/clap-m1-baseline.lock.json` retains historical M1 QA pins;
`qa-model.lock.json` now pins Larger CLAP General. Generation pins remain MLX
Small-SFX through task 07; the Medium GGUF migration belongs to task 08.
Ignored verification checkouts, model/runtime symlinks, private sessions, audio,
TARs, screenshots and evaluation datasets are local evidence, not distribution
inputs. No weights, tokens or generated audio were added to tracked source.

## M2 Medium migration inventory — task 08

Generation now uses `GgufBackend`, the pinned sa3.cpp/GGML source and five explicit
GGUF artifacts in `config.json`; `setup.mjs` owns build verification and
`download_models.py` resumes verified local downloads. `signal-requirements.lock`
is the five-package subset of the unchanged historical `requirements.lock`.
Signal analysis uses `.runtime/signal-venv`; Larger CLAP General and its locks are
unchanged. `backend.test.mjs` adds focused process/argument/fallback checks.
The config and run schemas, setup presence checks, CLI/workflow default, runtime
provenance, smoke process matching and user/agent documentation describe Medium.
Historical runtime/model references above remain extraction evidence.
See [task 08 evidence](tasks/m02/08-medium-gguf-generation.md#evidence) for exact pins,
validation and input/final hashes. Build environments, upstream source, binaries,
partial downloads, weights, original MLX assets, candidates and browser evidence
remain ignored; no runner changes, commits or publication are part of this task.
