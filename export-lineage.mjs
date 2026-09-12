import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inspectWav } from "./dist/wav.js";
import Ajv2020 from "ajv/dist/2020.js";

const schema = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema("run.schema.json"), "factory-run");
ajv.addSchema(schema("qa-report.schema.json"), "factory-qa");
ajv.addSchema(schema("review.schema.json"), "factory-review");
const validate = ajv.compile(schema("export.schema.json"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function verifyExport(record, bytes, readOriginal) {
  if (!validate(record))
    throw new Error(`Invalid export lineage: ${JSON.stringify(validate.errors)}`);
  const { generation, cut, analyses, review } = record;
  if (generation.status !== "completed" || cut.status !== "completed" || cut.kind !== "cuts")
    throw new Error("Export lineage requires completed generation and cut");
  if (cut.run_id !== generation.id || cut.source_sha256 !== generation.audio_sha256)
    throw new Error("Cut source does not match generation lineage");
  if (hash(bytes) !== cut.audio_sha256) throw new Error("Export audio hash mismatch");
  if (!readOriginal || hash(readOriginal(record.source_file)) !== generation.audio_sha256)
    throw new Error("Original audio hash mismatch or original missing");
  const bounds = cut.bounds;
  if (
    !bounds ||
    !Number.isInteger(bounds.start_sample) ||
    !Number.isInteger(bounds.end_sample) ||
    bounds.start_sample < 0 ||
    bounds.end_sample <= bounds.start_sample ||
    bounds.sample_rate !== generation.audio.sample_rate ||
    bounds.end_sample > Math.round(generation.audio.seconds * bounds.sample_rate)
  )
    throw new Error("Invalid export sample bounds");
  if (cut.loop) {
    const loop = cut.loop;
    if (loop.start_sample !== bounds.start_sample || loop.end_sample !== bounds.end_sample ||
        loop.sample_rate !== bounds.sample_rate || loop.channels !== generation.audio.channels ||
        (loop.processing_version === 'native-gain-v1'
          ? loop.split_sample !== null || loop.overlap_frames !== 0 || bounds.start_sample !== 0 || bounds.end_sample !== Math.round(generation.audio.seconds * bounds.sample_rate)
          : loop.split_sample <= bounds.start_sample || loop.split_sample >= bounds.end_sample ||
            loop.overlap_frames > Math.min(loop.split_sample - bounds.start_sample, bounds.end_sample - loop.split_sample)) ||
        loop.output_frames !== bounds.end_sample - bounds.start_sample - loop.overlap_frames ||
        Math.round(inspectWav(bytes, cut.request.gain_db > 0 ? 10 ** (-0.1 / 20) + 1 / 32768 : 0.708).seconds * bounds.sample_rate) !== loop.output_frames)
      throw new Error("Invalid loop frame evidence");
  }
  if (
    analyses.length !== review.analysis_ids.length ||
    new Set(analyses.map((a) => a.id)).size !== analyses.length
  )
    throw new Error("Review analysis references do not match retained reports");
  for (const analysis of analyses) {
    if (
      !review.analysis_ids.includes(analysis.id) ||
      analysis.kind !== "analyses" ||
      analysis.run_id !== generation.id ||
      analysis.source_sha256 !== generation.audio_sha256
    )
      throw new Error("QA source or review reference mismatch");
  }
  return {
    generation,
    review,
    duration_seconds: (cut.loop?.output_frames ?? (bounds.end_sample - bounds.start_sample)) / bounds.sample_rate,
  };
}
