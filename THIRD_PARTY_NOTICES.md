# Third-party notices and source inventory

Reviewed 2026-09-09 for source checkout `8571b4dfd2dfb933307bcfbf038ac768916593d3` plus this documentation change. This inventory is preparation for a source-only distribution, not a project license or a clearance of any particular use.

**Powered by Stability AI**

> This Stability AI Model is licensed under the Stability AI Community License, Copyright © Stability AI Ltd. All Rights Reserved

> Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms

## Distributed source boundary

The copied/adapted Urban Wildlife factory source, schemas, configuration, Python/JavaScript helpers and packaging inputs are identified by original revision and per-file SHA-256 in [the extraction inventory](docs/source-inventory.md). Source revision: `00d64d6cbf71bf0f9d35832784d7a9aa3ffe35aa`. Later copied/adapted tests, fixture/smoke helpers, launcher and agent skill are recorded in tasks [02](docs/tasks/m01/02-launcher-and-setup.md), [03](docs/tasks/m01/03-service-regressions.md), [04](docs/tasks/m01/04-portable-export-checks.md), and [06](docs/tasks/m01/06-agent-workflow.md). Standalone docs/examples and the pre-existing `scripts/` task runner are also project source; they are not licensed by any dependency's license.

The original inventory found no applicable source-code LICENSE/COPYING/NOTICE file or copyright/license header for the copied files. The owner subsequently confirmed license availability and directed closure in [task 12](docs/tasks/m01/12-license-and-release-readiness.md#owner-resolution--2026-09-09), resolving that blocker. This document adds no project license text or new grant of rights; third-party licenses apply only to their respective materials.

The source distribution is intended to contain project source, docs, schemas, examples, skill and locks. It does **not** bundle `node_modules`, `dist`, Python environments, upstream runtime checkout, model/encoder/tokenizer weights, generated WAVs, or system tools. Task 11 verifies the actual release list. Referencing/importing a package does not copy its implementation into the project source. Installing or redistributing those components retains their own terms; this inventory does not replace their full shipped notices.

## Separately downloaded runtime and models

`run` installs Node packages. `setup.mjs` builds the pinned Metal runtime below,
installs CMake 4.1.0 and `signal-requirements.lock` into private environments, and
`download_models.py` resumes and verifies five GGUF artifacts. `src/backend.ts`
executes `sa3-generate` and system FFmpeg. Larger CLAP General and its separate
`qa-requirements.lock` remain unchanged. No downloaded runtime, binary or weights
are included in this source distribution.

### Current Medium GGUF runtime and artifacts

Runtime: [sa3.cpp at 07db5c7980c8c6cc945c4f9d35959b3114246d95](https://github.com/betweentwomidnights/sa3.cpp/tree/07db5c7980c8c6cc945c4f9d35959b3114246d95),
[MIT, copyright 2026 betweentwomidnights](https://github.com/betweentwomidnights/sa3.cpp/blob/07db5c7980c8c6cc945c4f9d35959b3114246d95/LICENSE).
Its pinned [GGML fork at fff93d2714e934822100586ce241267e8cc821af](https://github.com/betweentwomidnights/ggml/tree/fff93d2714e934822100586ce241267e8cc821af)
is [MIT, copyright 2023–2026 The ggml authors](https://github.com/betweentwomidnights/ggml/blob/fff93d2714e934822100586ce241267e8cc821af/LICENSE).
Setup builds only generation/device-check executables, with static GGML libraries
and Apple Metal/Accelerate system frameworks. Full upstream notices remain in the
local checkout. [CMake 4.1.0](https://github.com/Kitware/CMake/blob/v4.1.0/Copyright.txt)
is a separately installed BSD-3-Clause build tool; Xcode/Apple SDKs are operator tools.

Medium artifacts are from `thepatch/stable-audio-3-medium-GGUF` revision
`380a7b25ba6b3b12563b01193227580a9ae7dac0`; shared text artifacts are from
`thepatch/t5gemma-b-b-ul2-GGUF` revision `26caadf5cb1b6523370caff61f6a32337f46625e`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [stable-audio-3-medium-conditioner-v1.0-F32.gguf](https://huggingface.co/thepatch/stable-audio-3-medium-GGUF/resolve/380a7b25ba6b3b12563b01193227580a9ae7dac0/stable-audio-3-medium-conditioner-v1.0-F32.gguf) | 793184 | `8482cc42559f665db517fd469e0dd073de36071ebbdbe0ef4d38b5392fe6c724` |
| [stable-audio-3-medium-dit-1.5B-v1.0-F16.gguf](https://huggingface.co/thepatch/stable-audio-3-medium-GGUF/resolve/380a7b25ba6b3b12563b01193227580a9ae7dac0/stable-audio-3-medium-dit-1.5B-v1.0-F16.gguf) | 2908081472 | `3f49edcbc724815339166323ca58a85bdb21215c5dee0237e396231b1c3ee50f` |
| [stable-audio-3-medium-same-l-v1.0-F16.gguf](https://huggingface.co/thepatch/stable-audio-3-medium-GGUF/resolve/380a7b25ba6b3b12563b01193227580a9ae7dac0/stable-audio-3-medium-same-l-v1.0-F16.gguf) | 1705121536 | `78d0592a7e1c6bce72d8177b2d291b820f6aafa4a428d5d61ada53286df1fc86` |
| [t5gemma-b-b-ul2-encoder-0.3B-v1.0-F32.gguf](https://huggingface.co/thepatch/t5gemma-b-b-ul2-GGUF/resolve/26caadf5cb1b6523370caff61f6a32337f46625e/t5gemma-b-b-ul2-encoder-0.3B-v1.0-F32.gguf) | 1126329120 | `23868718e395c555608e33128994c39a23d509281011e52173ff28a64ab6c43c` |
| [t5gemma-b-b-ul2-v1.0-vocab.gguf](https://huggingface.co/thepatch/t5gemma-b-b-ul2-GGUF/resolve/26caadf5cb1b6523370caff61f6a32337f46625e/t5gemma-b-b-ul2-v1.0-vocab.gguf) | 13838496 | `d58ef75568789d5d394a67231c853803bd24778d136aa0d1990210bcdd485d32` |

The pinned [Medium agreement](https://huggingface.co/thepatch/stable-audio-3-medium-GGUF/blob/380a7b25ba6b3b12563b01193227580a9ae7dac0/LICENSE.md)
is the Stability AI Community License (July 5, 2024). The shared encoder/tokenizer's
[Gemma agreement](https://huggingface.co/thepatch/t5gemma-b-b-ul2-GGUF/blob/26caadf5cb1b6523370caff61f6a32337f46625e/LICENSE.md)
and [NOTICE](https://huggingface.co/thepatch/t5gemma-b-b-ul2-GGUF/blob/26caadf5cb1b6523370caff61f6a32337f46625e/NOTICE)
retain the Gemma terms and attribution. The existing agreement copies and credits
below continue to apply. Owner license authorization is recorded in task 12 and
explicitly reused by M2 task 08; no publication or new grant of rights is claimed.
New companions use the pinned Medium agreement; historical companions are unchanged.

### Historical MLX runtime

Runtime: [Stability-AI/stable-audio-3 at 779434a908193105335fd8d833418603625b2859](https://github.com/Stability-AI/stable-audio-3/tree/779434a908193105335fd8d833418603625b2859), sparse checkout `optimized/mlx` under `.runtime/official-sa3`. Its exact root [LICENSE](https://github.com/Stability-AI/stable-audio-3/blob/779434a908193105335fd8d833418603625b2859/LICENSE) is MIT, copyright 2026 Stability AI, reproduced below. The runtime README also points generally to the Community License; that pointer must not be used to apply MIT to weights. Preserve both the code license and model terms if repackaging the runtime. No upstream runtime code or model is modified or redistributed in this source-only inventory.

### Historical Stable Audio MLX artifacts

All three come from [stabilityai/stable-audio-3-optimized at da6edc54ddba10bfd79a077102ded687f80e882b](https://huggingface.co/stabilityai/stable-audio-3-optimized/tree/da6edc54ddba10bfd79a077102ded687f80e882b/MLX). These are the official MLX conversion, not a GGUF conversion or the Medium model used in the card's example.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [dit_sm-sfx_f16.npz](https://huggingface.co/stabilityai/stable-audio-3-optimized/resolve/da6edc54ddba10bfd79a077102ded687f80e882b/MLX/dit_sm-sfx_f16.npz) | 919193814 | `7e702d2640699a57fe436ca975fda16832040ba568c1e092c2ae826987558118` |
| [same_s_decoder_f32.npz](https://huggingface.co/stabilityai/stable-audio-3-optimized/resolve/da6edc54ddba10bfd79a077102ded687f80e882b/MLX/same_s_decoder_f32.npz) | 218090820 | `909928a8e6937c1ebe6ac4b729f0462bd3773704a11ea18278e42671dc69bfe4` |
| [t5gemma_f16.npz](https://huggingface.co/stabilityai/stable-audio-3-optimized/resolve/da6edc54ddba10bfd79a077102ded687f80e882b/MLX/t5gemma_f16.npz) | 567443068 | `8deb20489f36d9aec539f26c9c67321f99bc5fe300d470435ed6e76be4f16bbd` |

The exact [model card](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/da6edc54ddba10bfd79a077102ded687f80e882b/README.md) identifies the Stability AI Community License and separately identifies `google/t5gemma-b-b-ul2` under Gemma terms. The pinned runtime's `optimized/mlx/models/defs/t5gemma_mlx.py` identifies this encoder and loads SentencePiece tokenizer bytes embedded in `t5gemma_f16.npz`; there is no separate Google model download in this flow. The repository's root `tokenizer.model` is not downloaded by this tool.

The exact [LICENSE.md](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/da6edc54ddba10bfd79a077102ded687f80e882b/LICENSE.md), dated July 5, 2024, is reproduced below. Its distribution clause covers products/services using the materials, so the attribution, documentation credit and agreement copy are included even though weights are downloaded separately. Commercial use is conditional, including registration and the agreement's aggregate affiliate revenue threshold; no registration or acceptance is performed here. Output ownership is stated only as between the user and Stability AI and only to the extent permitted by law. Restrictions also apply to outputs, including the incorporated AUP and foundational-model training restriction. This is not an unconditional commercial-use or copyright guarantee.

The incorporated [AUP effective July 31, 2025](https://stability.ai/2025-acceptable-use-policy) was reviewed. The [current policy URL](https://stability.ai/use-policy) presently displays a future September 30, 2026 effective date and links that previous version; do not treat the future version as already effective on this review date. Recheck the incorporated policy at use/release time.

The exact [LICENSE_GEMMA.md](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/da6edc54ddba10bfd79a077102ded687f80e882b/LICENSE_GEMMA.md), dated April 1, 2026, and [NOTICE](https://huggingface.co/stabilityai/stable-audio-3-optimized/blob/da6edc54ddba10bfd79a077102ded687f80e882b/NOTICE) establish the encoder terms and attribution above. Google's [terms](https://ai.google.dev/gemma/terms) and [Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy) (last modified February 21, 2024) were also reviewed. Gemma redistribution requires the agreement, notice, modification notices where applicable and enforceable use restrictions; merely copying this document would not satisfy every obligation for a future bundled/hosted model product. Google claims no rights in Gemma outputs, leaving responsibility with users; this does not license the final audio or erase Stability's restrictions. Google's gated model card returned HTTP 401 without login; the exact optimized artifact's public card, Gemma agreement and runtime encoder identification supply the needed evidence without accepting gated terms.

Task 11 corrected the historical MLX configuration so its companions reference the official pinned MLX agreement above. Older companions retain the inherited reference to `thepatch/stable-audio-3-small-sfx-GGUF` revision `fcbd756cde8f9cc4d0213433d868063593d6ca22`. That historical reference is **not authoritative evidence for these MLX artifacts**; use the exact official references above. Existing provenance is not rewritten.

### CLAP artifacts

The current QA checkpoint is [LAION Larger CLAP General at ada0c23a36c4e8582805bb38fec3905903f18b41](https://huggingface.co/laion/larger_clap_general/blob/ada0c23a36c4e8582805bb38fec3905903f18b41/README.md), declared Apache-2.0 by that card, with the same paper/authors below. Its eight verified artifacts total 779,810,876 bytes; exact hashes are in [qa-model.lock.json](qa-model.lock.json). The tree has no separate LICENSE/NOTICE file. It is downloaded separately, never bundled. The following table preserves the historical M1 baseline, also retained in [its original lock](docs/tasks/m02/clap-m1-baseline.lock.json).

[laion/clap-htsat-unfused at 8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a](https://huggingface.co/laion/clap-htsat-unfused/tree/8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a) is declared Apache-2.0 by its exact [model card](https://huggingface.co/laion/clap-htsat-unfused/blob/8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a/README.md). The pinned tree has no separate LICENSE or NOTICE file. Authors credited by the card: Yusong Wu, Ke Chen, Tianyu Zhang, Yuchen Hui, Taylor Berg-Kirkpatrick and Shlomo Dubnov; paper: [Large-scale Contrastive Language-Audio Pretraining with Feature Fusion and Keyword-to-Caption Augmentation](https://arxiv.org/abs/2211.06687). The paper citation's CC-BY-4.0 metadata is not the model license. CLAP evaluates audio; its license does not grant generation-model or audio-output rights. Apache-2.0 license text is linked at [Apache's authoritative source](https://www.apache.org/licenses/LICENSE-2.0); preserve the license and applicable notices/modification statements if redistributing CLAP.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `config.json` | 5390 | `9efb9557bc804f2ca6e394486af2e45dfed0b18554909735a99c6220b84e4288` |
| `merges.txt` | 456356 | `fe36cab26d4f4421ed725e10a2e9ddb7f799449c603a96e7f29b5a3c82a95862` |
| `preprocessor_config.json` | 541 | `9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753` |
| `pytorch_model.bin` | 614525833 | `1cd3c601bc4afe0fa87be3de4c13dd2cfadd249fac1e29acf74a9b296c3219bb` |
| `special_tokens_map.json` | 280 | `06e405a36dfe4b9604f484f6a1e619af1a7f7d09e34a8555eb0b77b66318067f` |
| `tokenizer.json` | 2108746 | `77ef92283d67f0d97e1454909a964afcbfa2019f0fb9f18f8e88d5c25c3ba729` |
| `tokenizer_config.json` | 384 | `377f91458f7729a4574a84c77bdce67dbc3c58c1a345a29bbf8c4eb1307948a3` |
| `vocab.json` | 798293 | `ed19656ea1707df69134c4af35c8ceda2cc9860bf2c3495026153a133670ab5e` |

## Locked packages installed separately

All entries below were checked against exact-version publisher metadata from npm/PyPI on 2026-09-09 and available installed license files from task 07's retained environments. Links lead directly to those exact-version registry records (including source/tarball links), not current package homepages. Node integrity hashes remain in `pnpm-lock.yaml`. Python locks pin versions, not wheel hashes or platform-specific native payloads: this is a source-distribution inventory, not a universal binary redistribution manifest. Retain each installed package's full license/NOTICE and bundled native-library notices when redistributing it; registry license labels alone do not replace them.

### Node: complete lock closure, including optional platforms

| Package/version | Declared license | Role |
| --- | --- | --- |
| [@types/node@26.1.1](https://registry.npmjs.org/@types/node/26.1.1) | MIT | build/type tooling |
| [@typescript/typescript-aix-ppc64@7.0.2](https://registry.npmjs.org/@typescript/typescript-aix-ppc64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-darwin-arm64@7.0.2](https://registry.npmjs.org/@typescript/typescript-darwin-arm64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-darwin-x64@7.0.2](https://registry.npmjs.org/@typescript/typescript-darwin-x64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-freebsd-arm64@7.0.2](https://registry.npmjs.org/@typescript/typescript-freebsd-arm64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-freebsd-x64@7.0.2](https://registry.npmjs.org/@typescript/typescript-freebsd-x64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-linux-arm@7.0.2](https://registry.npmjs.org/@typescript/typescript-linux-arm/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-linux-arm64@7.0.2](https://registry.npmjs.org/@typescript/typescript-linux-arm64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-linux-loong64@7.0.2](https://registry.npmjs.org/@typescript/typescript-linux-loong64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-linux-mips64el@7.0.2](https://registry.npmjs.org/@typescript/typescript-linux-mips64el/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-linux-ppc64@7.0.2](https://registry.npmjs.org/@typescript/typescript-linux-ppc64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-linux-riscv64@7.0.2](https://registry.npmjs.org/@typescript/typescript-linux-riscv64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-linux-s390x@7.0.2](https://registry.npmjs.org/@typescript/typescript-linux-s390x/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-linux-x64@7.0.2](https://registry.npmjs.org/@typescript/typescript-linux-x64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-netbsd-arm64@7.0.2](https://registry.npmjs.org/@typescript/typescript-netbsd-arm64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-netbsd-x64@7.0.2](https://registry.npmjs.org/@typescript/typescript-netbsd-x64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-openbsd-arm64@7.0.2](https://registry.npmjs.org/@typescript/typescript-openbsd-arm64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-openbsd-x64@7.0.2](https://registry.npmjs.org/@typescript/typescript-openbsd-x64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-sunos-x64@7.0.2](https://registry.npmjs.org/@typescript/typescript-sunos-x64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-win32-arm64@7.0.2](https://registry.npmjs.org/@typescript/typescript-win32-arm64/7.0.2) | Apache-2.0 | build/type tooling |
| [@typescript/typescript-win32-x64@7.0.2](https://registry.npmjs.org/@typescript/typescript-win32-x64/7.0.2) | Apache-2.0 | build/type tooling |
| [ajv@8.18.0](https://registry.npmjs.org/ajv/8.18.0) | MIT | runtime |
| [fast-deep-equal@3.1.3](https://registry.npmjs.org/fast-deep-equal/3.1.3) | MIT | runtime |
| [fast-uri@3.1.5](https://registry.npmjs.org/fast-uri/3.1.5) | BSD-3-Clause | runtime |
| [json-schema-traverse@1.0.0](https://registry.npmjs.org/json-schema-traverse/1.0.0) | MIT | runtime |
| [require-from-string@2.0.2](https://registry.npmjs.org/require-from-string/2.0.2) | MIT | runtime |
| [typescript@7.0.2](https://registry.npmjs.org/typescript/7.0.2) | Apache-2.0 | build/type tooling |
| [undici-types@8.3.0](https://registry.npmjs.org/undici-types/8.3.0) | MIT | build/type tooling |

### Python: complete union of both locks

G = generation/signal environment; Q = optional CLAP environment.

| Package/version | License inventory | Environment |
| --- | --- | --- |
| [anyio==4.15.1](https://pypi.org/pypi/anyio/4.15.1/json) | MIT | G |
| [certifi==2026.7.22](https://pypi.org/pypi/certifi/2026.7.22/json) | MPL-2.0 | G, Q |
| [cffi==2.1.1](https://pypi.org/pypi/cffi/2.1.1/json) | MIT-0 | G, Q |
| [charset-normalizer==3.5.1](https://pypi.org/pypi/charset-normalizer/3.5.1/json) | MIT | Q |
| [click==8.5.0](https://pypi.org/pypi/click/8.5.0/json) | BSD-3-Clause | G |
| [filelock==3.32.5](https://pypi.org/pypi/filelock/3.32.5/json) | MIT | G, Q |
| [fsspec==2026.7.0](https://pypi.org/pypi/fsspec/2026.7.0/json) | BSD-3-Clause | G, Q |
| [h11==0.16.0](https://pypi.org/pypi/h11/0.16.0/json) | MIT | G |
| [hf-xet==1.6.0](https://pypi.org/pypi/hf-xet/1.6.0/json) | Apache-2.0 | G, Q |
| [httpcore==1.0.9](https://pypi.org/pypi/httpcore/1.0.9/json) | BSD-3-Clause | G |
| [httpx==0.28.1](https://pypi.org/pypi/httpx/0.28.1/json) | BSD-3-Clause | G |
| [huggingface-hub==0.36.2](https://pypi.org/pypi/huggingface-hub/0.36.2/json) | Apache-2.0 | Q |
| [huggingface-hub==1.30.0](https://pypi.org/pypi/huggingface-hub/1.30.0/json) | Apache-2.0 | G |
| [idna==3.19](https://pypi.org/pypi/idna/3.19/json) | BSD-3-Clause | G, Q |
| [jinja2==3.1.6](https://pypi.org/pypi/jinja2/3.1.6/json) | BSD-3-Clause | Q |
| [markupsafe==3.0.3](https://pypi.org/pypi/markupsafe/3.0.3/json) | BSD-3-Clause | Q |
| [mlx==0.32.2](https://pypi.org/pypi/mlx/0.32.2/json) | MIT | G |
| [mlx-metal==0.32.2](https://pypi.org/pypi/mlx-metal/0.32.2/json) | MIT | G |
| [mpmath==1.3.0](https://pypi.org/pypi/mpmath/1.3.0/json) | BSD-3-Clause | Q |
| [networkx==3.6.1](https://pypi.org/pypi/networkx/3.6.1/json) | BSD-3-Clause | Q |
| [numpy==2.4.6](https://pypi.org/pypi/numpy/2.4.6/json) | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | G, Q |
| [packaging==26.3](https://pypi.org/pypi/packaging/26.3/json) | Apache-2.0 OR BSD-2-Clause | G, Q |
| [pycparser==3.0](https://pypi.org/pypi/pycparser/3.0/json) | BSD-3-Clause | G, Q |
| [pyyaml==6.0.3](https://pypi.org/pypi/pyyaml/6.0.3/json) | MIT | G, Q |
| [regex==2026.9.3](https://pypi.org/pypi/regex/2026.9.3/json) | Apache-2.0 AND CNRI-Python | Q |
| [requests==2.34.2](https://pypi.org/pypi/requests/2.34.2/json) | Apache-2.0 | Q |
| [safetensors==0.8.0](https://pypi.org/pypi/safetensors/0.8.0/json) | Apache-2.0 | Q |
| [sentencepiece==0.2.2](https://pypi.org/pypi/sentencepiece/0.2.2/json) | Apache-2.0 | G |
| [setuptools==84.0.0](https://pypi.org/pypi/setuptools/84.0.0/json) | MIT | Q |
| [soundfile==0.14.0](https://pypi.org/pypi/soundfile/0.14.0/json) | BSD-3-Clause | G, Q |
| [sympy==1.14.0](https://pypi.org/pypi/sympy/1.14.0/json) | BSD-3-Clause | Q |
| [tokenizers==0.22.2](https://pypi.org/pypi/tokenizers/0.22.2/json) | Apache-2.0 | Q |
| [torch==2.14.0](https://pypi.org/pypi/torch/2.14.0/json) | Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT | Q |
| [tqdm==4.70.0](https://pypi.org/pypi/tqdm/4.70.0/json) | MPL-2.0 AND MIT | G, Q |
| [transformers==4.57.6](https://pypi.org/pypi/transformers/4.57.6/json) | Apache-2.0 | Q |
| [typing-extensions==4.16.0](https://pypi.org/pypi/typing-extensions/4.16.0/json) | PSF-2.0 | G, Q |
| [urllib3==2.7.0](https://pypi.org/pypi/urllib3/2.7.0/json) | MIT | Q |

Native and notice details: NumPy and PyTorch carry composite licenses and extensive bundled notices; their table entries deliberately preserve the composite expressions. SoundFile's BSD Python wrapper does not relicense libsndfile (LGPL-2.1-or-later) or bundled codec libraries; inspect the actual wheel's `_soundfile_data` notices before any binary redistribution. Requests includes a NOTICE; tqdm includes both MPL/MIT notices; certifi's certificate bundle is MPL-2.0. These packages and native binaries are not in the proposed source distribution.

### External prerequisites

Node, pnpm, uv, Python, Git and FFmpeg are operator-installed tools, not vendored source. Task 07 records tested versions; only Python 3.11.15 and pnpm 9.15.9 are selected by setup/package configuration. Do not infer a fixed FFmpeg license from its version: [FFmpeg's legal documentation](https://www.ffmpeg.org/legal.html) explains LGPL/GPL and nonfree build distinctions. The program invokes it as a subprocess, and does not ship or link an FFmpeg binary. A future binary/environment bundle must inventory its exact builds (including CPython, libsndfile/codecs, MLX/Metal and PyTorch native components) and preserve their full notices/source obligations separately.

## Release status and use conditions

1. Task 11 records the prospective source inventory and clean-checkout verification.
2. Task 12 records the owner confirmation resolving licensing and closing release readiness. No license text was added by that status update.
3. At release/use time, recheck incorporated policies and the intended use's registration/enterprise conditions. No general commercial clearance is claimed. Task 11 verifies the corrected terms reference in new companions while preserving existing records.

No mandatory third-party terms source is unavailable for this source-only inventory. A gated Google card and the absence of a standalone CLAP LICENSE file are explicitly accounted for above. Bundling models, environments or tools, hosting generation, account registration, accepting terms and publication are outside this task.

## Verbatim runtime and model agreements

Trailing line whitespace is removed from the agreement copies; wording is unchanged. Source hashes identify the original downloaded bytes. These copies apply only to the identified third-party materials. They do not license Audio Factory's own source. The model repository's Gemma NOTICE is reproduced above, alongside the attribution required by Stability's agreement.

### Stable Audio runtime MIT license

Source SHA-256: `16bd922f0deee6f11a76f5582258fdc3abdf67c6b8719dbcafbc34dee31979a6`.

```text
MIT License

Copyright (c) 2026 Stability AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Stable Audio model Community License

Source SHA-256: `d6f6b1a4dce5c852bd6d7d9482d002baf0ccdb71e662250b73be9eec8764ee8d`.

```text
STABILITY AI COMMUNITY LICENSE AGREEMENT

Last Updated: July 5, 2024

1. INTRODUCTION

This Agreement applies to any individual person or entity (“You”, “Your” or “Licensee”) that uses or distributes any portion or element of the Stability AI Materials  or Derivative Works thereof for any Research & Non-Commercial or Commercial purpose. Capitalized terms not otherwise defined herein are defined in Section V below.

This Agreement is intended to allow research, non-commercial, and limited commercial uses of the Models free of charge. In order to ensure that certain limited commercial uses of the Models continue to be allowed, this Agreement  preserves free access to the Models for people or organizations  generating annual revenue of less than US $1,000,000 (or local currency equivalent).

By clicking “I Accept”  or by using or distributing or using any portion or element of the Stability Materials or Derivative Works, You agree that You have read, understood and are bound by the terms of this Agreement. If You are acting on behalf of a company, organization or other entity, then “You” includes you and that entity, and You agree that You: (i) are an authorized representative of such entity with the authority to bind such entity to this Agreement, and (ii) You agree to the terms of this Agreement on that entity’s behalf.

2. RESEARCH & NON-COMMERCIAL USE LICENSE

Subject to the terms of this Agreement, Stability AI grants You a non-exclusive, worldwide, non-transferable, non-sublicensable, revocable and royalty-free limited license under Stability AI’s intellectual property or other rights owned by Stability AI embodied in the Stability AI Materials to use, reproduce, distribute, and create Derivative Works of, and make modifications to, the Stability AI Materials for any Research or Non-Commercial Purpose. “Research Purpose” means academic or scientific advancement, and in each case, is not primarily intended for commercial advantage or monetary compensation to You or others. “Non-Commercial Purpose” means any purpose other than a Research Purpose that is not primarily intended for commercial advantage or monetary compensation to You or others, such as personal use (i.e., hobbyist) or evaluation and testing.

3. COMMERCIAL USE LICENSE

Subject to the terms of this Agreement (including the remainder of this Section III), Stability AI grants You a non-exclusive, worldwide, non-transferable, non-sublicensable, revocable and royalty-free limited license under Stability AI’s intellectual property or other rights owned by Stability AI embodied in the Stability AI Materials to use, reproduce, distribute, and create Derivative Works of, and make modifications to, the Stability AI Materials for any Commercial Purpose. “Commercial Purpose” means any purpose other than a Research Purpose or Non-Commercial Purpose that is primarily intended for commercial advantage or monetary compensation to You or others, including but not limited to, (i) creating, modifying, or distributing Your product or service, including via a hosted service or application programming interface, and (ii) for Your business’s or organization’s internal operations.
If You are using or distributing the Stability AI Materials for a Commercial Purpose, You must register with Stability AI at (https://stability.ai/community-license). If at any time You or Your Affiliate(s), either individually or in aggregate, generate more than USD $1,000,000 in annual revenue (or the equivalent thereof in Your local currency), regardless of whether that revenue is generated directly or indirectly from the Stability AI Materials or Derivative Works, any licenses granted to You under this Agreement shall terminate as of such date. You must request a license from Stability AI at (https://stability.ai/enterprise) , which Stability AI may grant to You in its sole discretion. If you receive Stability AI Materials, or any Derivative Works thereof, from a Licensee as part of an integrated end user product, then Section III of this Agreement will not apply to you.

4. GENERAL TERMS

Your Research, Non-Commercial, and Commercial License(s) under this Agreement are subject to the following terms.
a.  Distribution & Attribution. If You distribute or make available the Stability AI Materials or a Derivative Work to a third party, or a product or service that uses any portion of them, You shall: (i) provide a copy of this Agreement to that third party, (ii) retain the following attribution notice within a "Notice" text file distributed as a part of such copies: "This Stability AI Model is licensed under the Stability AI Community License, Copyright ©  Stability AI Ltd. All Rights Reserved”, and (iii) prominently display “Powered by Stability AI” on a related website, user interface, blogpost, about page, or product documentation.  If You create a Derivative Work, You may add your own attribution notice(s) to the “Notice” text file included with that Derivative Work, provided that You clearly indicate which attributions apply to the Stability AI Materials and state in the “Notice” text file that You changed the Stability AI Materials and how it was modified.
b.  Use Restrictions. Your use of the Stability AI Materials and Derivative Works, including any output or results of the Stability AI Materials or Derivative Works, must comply with applicable laws and regulations (including Trade Control Laws and equivalent regulations) and adhere to the Documentation and Stability AI’s AUP, which is hereby incorporated by reference. Furthermore, You will not use the Stability AI Materials or Derivative Works, or any output or results of the Stability AI Materials or Derivative Works, to create or improve any foundational generative AI model (excluding the Models or Derivative Works).
c.  Intellectual Property.
(i) Trademark License.  No trademark licenses are granted under this Agreement, and in connection with the Stability AI Materials or Derivative Works, You may not use any name or mark owned by or associated with Stability AI or any of its Affiliates, except as required under Section IV(a) herein.
(ii)  Ownership of Derivative Works.  As between You and Stability AI, You are the owner of Derivative Works You create, subject to Stability AI’s ownership of the Stability AI Materials and any Derivative Works made by or for Stability AI.
(iii)  Ownership of Outputs. As between You and Stability AI, You own any outputs generated from the Models or Derivative Works to the extent permitted by applicable law.
(iv)  Disputes.  If You or Your Affiliate(s) institute litigation or other proceedings against Stability AI (including a cross-claim or counterclaim in a lawsuit) alleging that the Stability AI Materials, Derivative Works or associated outputs or results, or any portion of any of the foregoing, constitutes infringement of intellectual property or other rights owned or licensable by You, then any licenses granted to You under this Agreement shall terminate as of the date such litigation or claim is filed or instituted. You will indemnify and hold harmless Stability AI from and against any claim by any third party arising out of or related to Your use or distribution of the Stability AI Materials or Derivative Works in violation of this Agreement.
(v)  Feedback.  From time to time, You may provide Stability AI with verbal and/or written suggestions, comments or other feedback related to Stability AI’s existing or prospective technology, products or services (collectively, “Feedback”). You are not obligated to provide Stability AI with Feedback, but to the extent that You do, You hereby grant Stability AI a perpetual, irrevocable, royalty-free, fully-paid, sub-licensable, transferable, non-exclusive, worldwide right and license to exploit the Feedback in any manner without restriction. Your Feedback is provided “AS IS” and You make no warranties whatsoever about any Feedback.
d.  Disclaimer Of Warranty. UNLESS REQUIRED BY APPLICABLE LAW, THE STABILITY AI MATERIALS AND ANY OUTPUT AND RESULTS THEREFROM ARE PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING, WITHOUT LIMITATION, ANY WARRANTIES OF TITLE, NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE. YOU ARE SOLELY RESPONSIBLE FOR DETERMINING THE APPROPRIATENESS OR LAWFULNESS OF USING OR REDISTRIBUTING THE STABILITY AI MATERIALS, DERIVATIVE WORKS OR ANY OUTPUT OR RESULTS AND ASSUME ANY RISKS ASSOCIATED WITH YOUR USE OF THE STABILITY AI MATERIALS, DERIVATIVE WORKS AND ANY OUTPUT AND RESULTS.
e.  Limitation Of Liability. IN NO EVENT WILL STABILITY AI OR ITS AFFILIATES BE LIABLE UNDER ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, TORT, NEGLIGENCE, PRODUCTS LIABILITY, OR OTHERWISE, ARISING OUT OF THIS AGREEMENT, FOR ANY LOST PROFITS OR ANY DIRECT, INDIRECT, SPECIAL, CONSEQUENTIAL, INCIDENTAL, EXEMPLARY OR PUNITIVE DAMAGES, EVEN IF STABILITY AI OR ITS AFFILIATES HAVE BEEN ADVISED OF THE POSSIBILITY OF ANY OF THE FOREGOING.
f.  Term And Termination. The term of this Agreement will commence upon Your acceptance of this Agreement or access to the Stability AI Materials and will continue in full force and effect until terminated in accordance with the terms and conditions herein. Stability AI may terminate this Agreement if You are in breach of any term or condition of this Agreement. Upon termination of this Agreement, You shall delete and cease use of any Stability AI Materials or Derivative Works. Section IV(d), (e), and (g) shall survive the termination of this Agreement.
g.  Governing Law.  This Agreement will be governed by and constructed in accordance with the laws of the United States and the State of California without regard to choice of law principles, and the UN Convention on Contracts for International Sale of Goods does not apply to this Agreement.

5. DEFINITIONS

“Affiliate(s)” means any entity that directly or indirectly controls, is controlled by, or is under common control with the subject entity; for purposes of this definition, “control” means direct or indirect ownership or control of more than 50% of the voting interests of the subject entity.

"Agreement" means this Stability AI Community License Agreement.

“AUP” means the Stability AI Acceptable Use Policy available at (https://stability.ai/use-policy), as may be updated from time to time.

"Derivative Work(s)” means (a) any derivative work of the Stability AI Materials as recognized by U.S. copyright laws and (b) any modifications to a Model, and any other model created which is based on or derived from the Model or the Model’s output, including “fine tune” and “low-rank adaptation” models derived from a Model or a Model’s output, but do not include the output of any Model.

“Documentation” means any specifications, manuals, documentation, and other written information provided by Stability AI related to the Software or Models.

“Model(s)" means, collectively, Stability AI’s proprietary models and algorithms, including machine-learning models, trained model weights and other elements of the foregoing listed on Stability’s Core Models Webpage available at (https://stability.ai/core-models), as may be updated from time to time.

"Stability AI" or "we" means Stability AI Ltd. and its Affiliates.

"Software" means Stability AI’s proprietary software made available under this Agreement now or in the future.

“Stability AI Materials” means, collectively, Stability’s proprietary Models, Software and Documentation (and any portion or combination thereof) made available under this Agreement.

“Trade Control Laws” means any applicable U.S. and non-U.S. export control and trade sanctions laws and regulations.
```

### T5Gemma Terms of Use

Source SHA-256: `e77acc0d3163bb7534675045c584b4d04b387b529239fc4b3647da0a01ba4745`.

```text
# Gemma Terms of Use

The terms below apply to Gemma models listed in the Appendix at bottom of this page. For Gemma 4 terms, see the [Gemma 4 license](https://ai.google.dev/gemma/apache_2).

Last modified: April 1, 2026

By using, reproducing, modifying, distributing, performing or displaying any
portion or element of Gemma, Model Derivatives including via any Hosted Service,
(each as defined below) (collectively, the "**Gemma Services**") or otherwise
accepting the terms of this Agreement, you agree to be bound by this Agreement.

## Section 1: DEFINITIONS

### 1.1 Definitions

(a) "**Agreement** " or "**Gemma Terms of Use**" means these terms and conditions
that govern the use, reproduction, Distribution or modification of the Gemma
Services and any terms and conditions incorporated by reference.

(b) "**Distribution** " or "**Distribute** " means any transmission, publication,
or other sharing of Gemma or Model Derivatives to a third party, including by
providing or making Gemma or its functionality available as a hosted service via
API, web access, or any other electronic or remote means ("**Hosted Service**").

(c) "**Gemma** " means the set of machine learning language models, trained model
weights and parameters identified in the [Appendix](https://ai.google.dev/gemma/terms#appendix),
regardless of the source that you obtained it from.

(d) "**Google**" means Google LLC.

(e) "**Model Derivatives**" means all (i) modifications to Gemma, (ii) works based
on Gemma, or (iii) any other machine learning model which is created by transfer
of patterns of the weights, parameters, operations, or Output of Gemma, to that
model in order to cause that model to perform similarly to Gemma, including
distillation methods that use intermediate data representations or methods based
on the generation of synthetic data Outputs by Gemma for training that model.
For clarity, Outputs are not deemed Model Derivatives.

(f) "**Output**" means the information content output of Gemma or a Model
Derivative that results from operating or otherwise using Gemma or the Model
Derivative, including via a Hosted Service.

### 1.2

As used in this Agreement, "**including** " means
"**including without limitation**".

## Section 2: ELIGIBILITY AND USAGE

### 2.1 Eligibility

You represent and warrant that you have the legal capacity to enter into this
Agreement (including being of sufficient age of consent). If you are accessing
or using any of the Gemma Services for or on behalf of a legal entity, (a) you
are entering into this Agreement on behalf of yourself and that legal entity,
(b) you represent and warrant that you have the authority to act on behalf of
and bind that entity to this Agreement and (c) references to "**you** " or
"**your**" in the remainder of this Agreement refers to both you (as an
individual) and that entity.

### 2.2 Use

You may use, reproduce, modify, Distribute, perform or display any of the Gemma
Services only in accordance with the terms of this Agreement, and must not
violate (or encourage or permit anyone else to violate) any term of this
Agreement.

## Section 3: DISTRIBUTION AND RESTRICTIONS

### 3.1 Distribution and Redistribution

You may reproduce or Distribute copies of Gemma or Model Derivatives if you meet
all of the following conditions:

1. You must include the use restrictions referenced in Section 3.2 as an enforceable provision in any agreement (e.g., license agreement, terms of use, etc.) governing the use and/or distribution of Gemma or Model Derivatives and you must provide notice to subsequent users you Distribute to that Gemma or Model Derivatives are subject to the use restrictions in Section 3.2.
2. You must provide all third party recipients of Gemma or Model Derivatives a copy of this Agreement.
3. You must cause any modified files to carry prominent notices stating that you modified the files.
4. All Distributions (other than through a Hosted Service) must be accompanied by a "**Notice** " text file that contains the following notice: "**Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms**".

You may add your own intellectual property statement to your modifications and,
except as set forth in this Section, may provide additional or different terms
and conditions for use, reproduction, or Distribution of your modifications, or
for any such Model Derivatives as a whole, provided your use, reproduction,
modification, Distribution, performance, and display of Gemma otherwise complies
with the terms and conditions of this Agreement. Any additional or different
terms and conditions you impose must not conflict with the terms of this
Agreement.

### 3.2 Use Restrictions

You must not use any of the Gemma Services:

1. for the restricted uses set forth in the Gemma Prohibited Use Policy at [ai.google.dev/gemma/prohibited_use_policy](https://ai.google.dev/gemma/prohibited_use_policy) ("**Prohibited Use Policy**"), which is hereby incorporated by reference into this Agreement; or
2. in violation of applicable laws and regulations.

To the maximum extent permitted by law, Google reserves the right to restrict
(remotely or otherwise) usage of any of the Gemma Services that Google
reasonably believes are in violation of this Agreement.

### 3.3 Generated Output

Google claims no rights in Outputs you generate using Gemma. You and your users
are solely responsible for Outputs and their subsequent uses.

## Section 4: ADDITIONAL PROVISIONS

### 4.1 Updates

Google may update Gemma from time to time.

### 4.2 Trademarks

Nothing in this Agreement grants you any rights to use Google's trademarks,
trade names, logos or to otherwise suggest endorsement or misrepresent the
relationship between you and Google. Google reserves any rights not expressly
granted herein.

### 4.3 DISCLAIMER OF WARRANTY

UNLESS REQUIRED BY APPLICABLE LAW, THE GEMMA SERVICES, AND OUTPUTS, ARE PROVIDED
ON AN "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER
EXPRESS OR IMPLIED, INCLUDING ANY WARRANTIES OR CONDITIONS OF TITLE,
NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE. YOU ARE
SOLELY RESPONSIBLE FOR DETERMINING THE APPROPRIATENESS OF USING, REPRODUCING,
MODIFYING, PERFORMING, DISPLAYING OR DISTRIBUTING ANY OF THE GEMMA SERVICES
OR OUTPUTS AND ASSUME ANY AND ALL RISKS ASSOCIATED WITH YOUR USE OR DISTRIBUTION
OF ANY OF THE GEMMA SERVICES OR OUTPUTS AND YOUR EXERCISE OF RIGHTS AND
PERMISSIONS UNDER THIS AGREEMENT.

### 4.4 LIMITATION OF LIABILITY

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT AND UNDER NO
LEGAL THEORY, WHETHER IN TORT (INCLUDING NEGLIGENCE), PRODUCT LIABILITY,
CONTRACT, OR OTHERWISE, UNLESS REQUIRED BY APPLICABLE LAW, SHALL GOOGLE OR ITS
AFFILIATES BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY DIRECT, INDIRECT,
SPECIAL, INCIDENTAL, EXEMPLARY, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOST
PROFITS OF ANY KIND ARISING FROM THIS AGREEMENT OR RELATED TO, ANY OF THE GEMMA
SERVICES OR OUTPUTS EVEN IF GOOGLE OR ITS AFFILIATES HAVE BEEN ADVISED OF THE
POSSIBILITY OF SUCH DAMAGES.

### 4.5 Term, Termination, and Survival

The term of this Agreement will commence upon your acceptance of this Agreement
(including acceptance by your use, modification, or Distribution, reproduction,
performance or display of any portion or element of the Gemma Services) and will
continue in full force and effect until terminated in accordance with the terms
of this Agreement. Google may terminate this Agreement if you are in breach of
any term of this Agreement. Upon termination of this Agreement, you must delete
and cease use and Distribution of all copies of Gemma and Model Derivatives in
your possession or control. Sections 1, 2.1, 3.3, 4.2 to 4.9 shall survive the
termination of this Agreement.

### 4.6 Governing Law and Jurisdiction

This Agreement will be governed by the laws of the State of California without
regard to choice of law principles. The UN Convention on Contracts for the
International Sale of Goods does not apply to this Agreement. The state and
federal courts of Santa Clara County, California shall have exclusive
jurisdiction of any dispute arising out of this Agreement.

### 4.7 Severability

If any provision of this Agreement is held to be invalid, illegal or
unenforceable, the remaining provisions shall be unaffected thereby and remain
valid as if such provision had not been set forth herein.

### 4.8 Entire Agreement

This Agreement states all the terms agreed between the parties and supersedes
all other agreements between the parties as of the date of acceptance relating
to its subject matter.

### 4.9 No Waiver

Google will not be treated as having waived any rights by not exercising (or
delaying the exercise of) any rights under this Agreement.

## Appendix

- [Gemma 1](https://ai.google.dev/gemma/docs/core/model_card)
- [Gemma 1.1](https://ai.google.dev/gemma/docs/core/model_card)
- [Gemma 2](https://ai.google.dev/gemma/docs/core/model_card_2)
- [Gemma 3](https://ai.google.dev/gemma/docs/core/model_card_3)
- [Gemma 3n](https://ai.google.dev/gemma/docs/3n)
- [FunctionGemma](https://ai.google.dev/gemma/docs/functiongemma)
- [EmbeddingGemma](https://ai.google.dev/gemma/docs/embeddinggemma)
- [PaliGemma](https://ai.google.dev/gemma/docs/paligemma/model-card)
- [PaliGemma 2](https://ai.google.dev/gemma/docs/paligemma/model-card-2)
- [ShieldGemma](https://ai.google.dev/gemma/docs/shieldgemma/model_card)
- [ShieldGemma 2](https://ai.google.dev/gemma/docs/shieldgemma/model_card_2)
- [CodeGemma](https://ai.google.dev/gemma/docs/codegemma/model_card)
- [CodeGemma 1.1](https://ai.google.dev/gemma/docs/codegemma/model_card)
- [Gemma 2 JPN](https://huggingface.co/google/gemma-2-2b-jpn-it)
- [DataGemma RIG](https://www.kaggle.com/models/google/datagemma-rig)
- [DataGemma RAG](https://www.kaggle.com/models/google/datagemma-rag)
- [RecurrentGemma](https://ai.google.dev/gemma/docs/recurrentgemma/model_card)
- [Gemma Scope](https://ai.google.dev/gemma/docs/gemma_scope)
- [Gemma-APS](https://ai.google.dev/gemma/docs/gemma-aps)
- [T5Gemma](https://www.kaggle.com/models/google/t5gemma)
- [VaultGemma](https://www.kaggle.com/models/google/vaultgemma)
- [FunctionGemma](https://www.kaggle.com/models/google/functiongemma)
- [T5Gemma 2](https://www.kaggle.com/models/google/t5gemma-2)
- [TranslateGemma](https://www.kaggle.com/models/google/translategemma)

> [!NOTE]
> **Note:** Previous versions of these Terms are [archived here](https://ai.google.dev/gemma/terms-archive).
```
