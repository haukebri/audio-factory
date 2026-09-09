# Local feedback evaluation

The studio’s **Feedback collection** view shows real label counts, coverage, conflicting duplicate labels, human/automatic disagreements and unreviewed clips. **Review an unreviewed clip** opens blind review. **Export evaluation dataset** downloads audio, candidate records, complete correction history and recorded request attempts. The dataset stays local; it contains private prompts and audio.

Build first (`pnpm build`). The evaluation CLI only replays cached measurements: zero generations, zero model inference, no upload or training. Missing matching scores produce uncertainty, not acceptance. Full rescoring is outside this command and requires a separately recorded workload budget.

## Freeze before tuning

```sh
node evaluation.mjs export .runtime/studio .runtime/feedback-v1.json .runtime/families.json
node evaluation.mjs import .runtime/feedback-v1.json .runtime/feedback-import-v1
node evaluation.mjs freeze .runtime/feedback-v1.json
```

The optional family JSON maps exact prompts to shared family names, for example `{"A wooden knock":"wood-impact","Two wooden knocks":"wood-impact"}`. Review this mapping **before** freezing: include related descriptions and known near-duplicate recordings under the same family. Without the map, normalized identical prompts are grouped automatically. Acoustic near-duplicate detection is not inferred from CLAP similarity. Every source lineage, attempt, request/continuation and exact duplicate audio also joins the same connected component. A deterministic 80/20 hash split assigns whole components; small datasets may have no holdout. No rebalancing by labels occurs.

Export and import destinations must be new. Import validates candidate identity, audio bytes, lineage, feedback actors, timestamps and supersession chains in a staging directory before publishing a new review store. It does not merge into a live store. The imported `dataset.json` retains the frozen benchmark and request history; opening the imported review store supports playback/feedback access but does not replay its jobs. Retain original exports to preserve historical snapshots when new human corrections arrive.

`freeze` prints the benchmark ID. Subsequent records live under `.runtime/evaluation/`, keyed by content hash:

```sh
node evaluation.mjs register BENCHMARK_ID
node evaluation.mjs register BENCHMARK_ID .runtime/stricter-policy.json
node evaluation.mjs run BENCHMARK_ID POLICY_ID development
node evaluation.mjs run BENCHMARK_ID POLICY_ID holdout
node evaluation.mjs run BENCHMARK_ID POLICY_ID holdout
```

`register` prints the policy ID and development report. A policy JSON has `version`, `judge` (the complete `judge-policy.json` shape) and `selection` (`attempts`, `milliseconds` in whole minutes, `region`: `first` or `recorded-alternate`). The default is three attempts/20 minutes with the recorded alternate-region behavior. Start with development-only threshold changes. Description changes require matching cached description scores; unrecorded regions and retries cannot be simulated into existence.

Register all comparison policies before inspecting holdout. Once a benchmark’s holdout has been run, new policies are refused for that benchmark. Regrouping into a new benchmark cannot move previously inspected holdout audio, sources, normalized prompts or declared families into development. Keep the registry when moving datasets so this history remains enforceable. New tuning needs genuinely untouched data. Implementation hashes are frozen too: changed evaluator code requires a new benchmark while preserving old reports.

## Compare and select

Reports include M1 and Larger CLAP confusion counts, abstentions by human class, precision, false-accept/reject rates, coverage and Wilson 95% intervals with explicit numerators/denominators. Paired comparisons use matching labelled inputs. Bounded replay reports selected outcomes, missing evidence, human approval, first-attempt approval, paired selection comparison, attempts and recorded generation/QA latency. Memory was not recorded and is reported unavailable. Intervals are descriptive per-clip estimates; related clips are not independent evidence of established quality.

Bounded replay evaluates the first cut under the comparison policy before deciding whether to use the recorded alternate. Missing required alternate evidence stays unresolved; latency includes only the operations used by that replay.

M1 (`laion/clap-htsat-unfused`, retained pinned revision) was advisory, not a binary judge. Its **explicit evaluation proxy**, frozen in the manifest, accepts only when the target ranks first in every window and silence/clipping checks pass. This is not a rewritten historical verdict. Source-only M1 scores cannot evaluate a different delivered cut. Larger CLAP replay checks audio, model/revision/artifact hashes, target, description list and original rubric provenance before applying the comparison thresholds. Duplicate audio counts once; conflicting current labels or different intents on identical audio are excluded from ground truth. Earlier superseded events remain in the audit history. Automatic verdicts, legacy review metadata and fixture labels never become real ground truth.

```sh
node evaluation.mjs select BENCHMARK_ID TESTED_POLICY_ID
# Rollback uses the same command with the earlier tested policy ID:
node evaluation.mjs select BENCHMARK_ID EARLIER_POLICY_ID
```

Selection is an explicit local mutation, logged with its predecessor. It affects **new** studio/CLI workflow requests and new manually adjusted cuts. A job snapshots its policy and caps its automatic budget at the selected limits; recovery and idempotent submission keep that snapshot. Historical candidate verdicts, feedback and benchmark results are unchanged. Development testing permits experimental selection; it does not certify acoustic quality. No real active policy is selected by the task’s checks.

Results remain `quality_not_established` and quality milestone items remain unchecked until independent review supports the frozen targets: 100 real human-labelled clips (50 approved/50 rejected, at least 10 families), 50% fewer false accepts, 90% acceptance precision, at most 20% false rejects, and 20 percentage points more human-approved selections. Report the exact missing counts while collecting data; do not hold the engineering queue for labels. Use `run ... holdout --synthetic` only for explicitly identified fixture metrics, never quality claims.

## Verification and recovery

`node --test evaluation.test.mjs` verifies an independently specified confusion table, corrections, deduplication, grouped isolation, cached description compatibility, reject→accept selection, portable import/restart, policy snapshots and repeatable holdout/rollback. `pnpm test:audio-factory` also covers the affected service, judge and workflow paths.

Imports stage privately and remove failed staging on ordinary errors. An interrupted import may leave a `.evaluation-import-*` directory beside its destination; inspect/preserve that owned partial directory and rerun to a new destination. Existing final exports and content-addressed records are never overwritten. A corrupted immutable record fails explicitly; preserve it for diagnosis rather than replacing historical evidence. Selection writes its audit event before replacing the active pointer; rerunning selection of the same tested policy is safe. No evaluation command starts a model process.
