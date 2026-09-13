import { createHash, randomUUID } from "node:crypto";
import { constants, closeSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { inspectWav } from "./dist/wav.js";
import { verifyExport } from "./export-lineage.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
// Stable object ordering makes retries independent of JSON property order.
const serialize = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const id = { type: "string", pattern: "^[a-f0-9]{32}$" };
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" };
const note = { type: "string", maxLength: 4000 };
const tags = { type: "array", uniqueItems: true, maxItems: 6, items: { enum: ["wrong_sound", "extra_events", "background_noise", "artifacts", "bad_trim", "other"] } };
const object = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const nullable = schema => ({ anyOf: [schema, { type: "null" }] });
const ajv = new Ajv2020({ strict: true, allErrors: true });
for (const [name, file] of Object.entries({ "factory-run": "run", "factory-qa": "qa-report", "factory-review": "review", "factory-export": "export" }))
  ajv.addSchema(JSON.parse(readFileSync(new URL(`${file}.schema.json`, import.meta.url))), name);
const candidateSchema = object({
  attempt_id: id,
  fixture: { type: "boolean" },
  evidence: { anyOf: [
    { $ref: "factory-export" },
    object({ generation: { $ref: "factory-run" }, analyses: { type: "array", maxItems: 32, items: { $ref: "factory-qa" } },
      cut_failure: nullable({ $ref: "factory-qa" }), reason: { ...note, minLength: 1, pattern: "\\S" } }),
  ] },
  evaluation: nullable(object({
    actor: { const: "automatic" }, audio_sha256: digest,
    model: { type: "string", minLength: 1, maxLength: 200 }, revision: { type: "string", minLength: 1, maxLength: 200 },
    rubric_sha256: digest, verdict: { enum: ["auto_accepted", "rejected", "needs_review"] },
    reason_tags: { type: 'array', uniqueItems: true, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 80 } }, note,
  })),
});
const evaluationSchema = candidateSchema.properties.evaluation.anyOf[0];
evaluationSchema.properties.evidence = object({
  status: { enum: ['completed', 'unavailable'] }, decision: { enum: ['accept', 'reject', 'uncertain'] },
  reason_tags: evaluationSchema.properties.reason_tags,
  policy: { type: 'object' }, target: { type: 'string', minLength: 1, maxLength: 2000 },
  target_sha256: digest, descriptions_sha256: digest, elapsed_ms: { type: 'integer', minimum: 0 },
  error: nullable({ type: 'string', maxLength: 2000 }), result: nullable({ type: 'object' }),
});
const feedbackSchema = object({
  event_id: id, candidate_sha256: digest, supersedes: nullable(id), actor: { const: "human" },
  verdict: { enum: ["accepted", "rejected"] }, reason_tags: tags, note,
});
const validCandidate = ajv.compile(candidateSchema);
const validFeedback = ajv.compile(feedbackSchema);
const validEvent = ajv.compile(object({ ...feedbackSchema.properties,
  timestamp: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$" },
}));
function check(validate, value) {
  if (!validate(value)) throw new Error(`Invalid review record: ${JSON.stringify(validate.errors)}`);
}
function checkId(value, length = 64) {
  if (typeof value !== "string" || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) throw new Error("Invalid review ID");
}
function syncDirectory(path) {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function write(path, bytes) {
  const fd = openSync(path, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function directory(path) {
  if (!lstatSync(path).isDirectory()) throw new Error("Review directory must not be a symlink");
}
function read(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return readFileSync(fd); } finally { closeSync(fd); }
}
function verify(candidate, source, audio) {
  check(validCandidate, candidate);
  const { evidence, evaluation } = candidate;
  const { generation, analyses } = evidence;
  if (generation.status !== "completed" || hash(source) !== generation.audio_sha256)
    throw new Error("Candidate source hash or generation mismatch");
  if (generation.runtime.backend === 'youtube') {
    const actual = inspectWav(source);
    if (Object.keys(actual).some(key => actual[key] !== generation.audio[key])) throw new Error('Imported audio properties mismatch');
  }
  if (evidence.cut) {
    if (!Buffer.isBuffer(audio)) throw new Error("Candidate requires delivered audio");
    verifyExport(evidence, audio, () => source);
  } else {
    if (audio !== null) throw new Error("Source-only candidate cannot have delivered audio");
    if (new Set(analyses.map(a => a.id)).size !== analyses.length) throw new Error("Duplicate analyses");
    for (const report of [...analyses, ...(evidence.cut_failure ? [evidence.cut_failure] : [])]) {
      if (report.run_id !== generation.id || report.source_sha256 !== generation.audio_sha256 ||
          (report === evidence.cut_failure ? report.kind !== "cuts" || !["failed", "interrupted"].includes(report.status) : report.kind !== "analyses"))
        throw new Error("Source-only QA lineage mismatch");
    }
  }
  if (evaluation && evaluation.audio_sha256 !== (evidence.cut?.audio_sha256 ?? generation.audio_sha256))
    throw new Error("Evaluation audio hash mismatch");
}

// Root is trusted application configuration, never a request path. Inputs contain bytes and IDs only.
export function openReviewStore(root = fileURLToPath(new URL("./.runtime/studio/", import.meta.url))) {
  root = resolve(root);
  if (root.split(sep).includes("out")) throw new Error("Review store must be outside out/");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  directory(root);
  for (const name of ["candidates", "pending", "feedback", "selections"]) {
    mkdirSync(join(root, name), { recursive: true, mode: 0o700 });
    directory(join(root, name));
  }
  function candidatePath(candidateId) {
    checkId(candidateId);
    directory(join(root, "candidates"));
    const path = join(root, "candidates", candidateId);
    directory(path);
    return path;
  }
  const validated = new Map();
  function fingerprint(path) {
    return ["candidate.json", "source.wav", "audio.wav"].map(name => {
      try {
        const s = lstatSync(join(path, name), { bigint: true });
        return [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].join(":");
      } catch (error) { if (name === "audio.wav" && error.code === "ENOENT") return "missing"; throw error; }
    }).join("|");
  }
  function loadCandidate(candidateId, verifyBytes = false) {
    const path = candidatePath(candidateId);
    const stamp = fingerprint(path);
    const cached = validated.get(candidateId);
    if (!verifyBytes && cached?.stamp === stamp) return structuredClone(cached.candidate);
    validated.delete(candidateId);
    const candidate = JSON.parse(read(join(path, "candidate.json")));
    if (hash(serialize(candidate)) !== candidateId) throw new Error("Candidate identity hash mismatch");
    const source = read(join(path, "source.wav"));
    const audio = candidate.evidence?.cut ? read(join(path, "audio.wav")) : null;
    verify(candidate, source, audio);
    const result = { candidate_sha256: candidateId, ...candidate };
    // Cache only a stable validation; callers cannot mutate the retained metadata.
    if (fingerprint(path) === stamp) validated.set(candidateId, { stamp, candidate: structuredClone(result) });
    return result;
  }
  function saveCandidate(candidate, source, audio = null) {
    // Snapshot caller-owned objects/buffers before validation and persistence.
    candidate = JSON.parse(serialize(candidate));
    source = Buffer.from(source);
    audio = audio === null ? null : Buffer.from(audio);
    verify(candidate, source, audio);
    const candidateId = hash(serialize(candidate));
    try { return loadCandidate(candidateId); } catch (error) { if (error.code !== "ENOENT") throw error; }
    directory(join(root, "pending"));
    const staging = join(root, "pending", `${candidateId}-${randomUUID()}`);
    mkdirSync(staging, { mode: 0o700 });
    syncDirectory(join(root, "pending"));
    write(join(staging, "source.wav"), source);
    if (audio) write(join(staging, "audio.wav"), audio);
    write(join(staging, "candidate.json"), serialize(candidate));
    verify(JSON.parse(read(join(staging, "candidate.json"))), read(join(staging, "source.wav")), audio ? read(join(staging, "audio.wav")) : null);
    syncDirectory(staging);
    directory(join(root, "candidates"));
    try { renameSync(staging, join(root, "candidates", candidateId)); }
    catch (error) { if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error; }
    syncDirectory(join(root, "candidates"));
    syncDirectory(join(root, "pending"));
    return loadCandidate(candidateId);
  }
  function history(candidateId) {
    loadCandidate(candidateId);
    directory(join(root, "feedback"));
    const path = join(root, "feedback", candidateId);
    try { directory(path); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
    const events = [];
    for (const name of readdirSync(path).filter(name => /^\d{10}\.json$/.test(name)).sort()) {
      if (name !== `${String(events.length + 1).padStart(10, "0")}.json`) throw new Error("Feedback history gap");
      const event = JSON.parse(read(join(path, name)));
      check(validEvent, event);
      if (event.candidate_sha256 !== candidateId || event.supersedes !== (events.at(-1)?.event_id ?? null) || events.some(e => e.event_id === event.event_id))
        throw new Error("Feedback history conflict");
      events.push(event);
    }
    return events;
  }
  function feedback(input, importedTimestamp) {
    input = JSON.parse(serialize(input));
    check(validFeedback, input);
    const events = history(input.candidate_sha256);
    const existing = events.find(event => event.event_id === input.event_id);
    if (existing) {
      const { timestamp, ...submission } = existing;
      if (serialize(submission) !== serialize(input)) throw new Error("Feedback event ID conflict");
      return existing;
    }
    if (input.supersedes !== (events.at(-1)?.event_id ?? null)) throw new Error("Stale feedback submission");
    const path = join(root, "feedback", input.candidate_sha256);
    mkdirSync(path, { recursive: true, mode: 0o700 });
    directory(path);
    syncDirectory(join(root, "feedback"));
    const event = { ...input, timestamp: importedTimestamp ?? new Date().toISOString() };
    const temporary = join(path, `pending-${randomUUID()}.json`);
    write(temporary, serialize(event));
    // Exclusive link publishes one revision across processes; no persistent lock to recover.
    try { linkSync(temporary, join(path, `${String(events.length + 1).padStart(10, "0")}.json`)); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      unlinkSync(temporary);
      return feedback(input); // Reload winner: identical retries succeed, stale conflicts fail.
    }
    syncDirectory(path);
    unlinkSync(temporary);
    syncDirectory(path);
    return event;
  }
  function listCandidates() {
    directory(join(root, "candidates"));
    return readdirSync(join(root, "candidates")).filter(name => /^[a-f0-9]{64}$/.test(name)).sort().map(id => loadCandidate(id));
  }
  function selectionHistory(soundId) {
    checkId(soundId, 32);
    const path = join(root, 'selections', soundId);
    try { directory(path); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const events = [];
    for (const name of readdirSync(path).filter(n => /^\d{10}\.json$/.test(n)).sort()) {
      const event = JSON.parse(read(join(path, name)));
      if (name !== `${String(events.length + 1).padStart(10, '0')}.json` || event.sound_id !== soundId || event.supersedes !== (events.at(-1)?.event_id ?? null)) throw new Error('Selection history conflict');
      checkId(event.event_id, 32); loadCandidate(event.candidate_sha256);
      events.push(event);
    }
    return events;
  }
  function selectTake(input) {
    if (!input || Object.keys(input).sort().join() !== 'candidate_sha256,event_id,sound_id,supersedes') throw new Error('Invalid selection');
    checkId(input.event_id, 32); checkId(input.sound_id, 32); loadCandidate(input.candidate_sha256);
    if (input.supersedes !== null) checkId(input.supersedes, 32);
    const events = selectionHistory(input.sound_id);
    const existing = events.find(e => e.event_id === input.event_id);
    if (existing) {
      const { timestamp, ...previous } = existing;
      if (serialize(previous) !== serialize(input)) throw new Error('Selection event conflict');
      return existing;
    }
    if (input.supersedes !== (events.at(-1)?.event_id ?? null)) throw new Error('Stale selection');
    const path = join(root, 'selections', input.sound_id);
    mkdirSync(path, { recursive: true, mode: 0o700 }); directory(path); syncDirectory(join(root, 'selections'));
    const event = { ...input, timestamp: new Date().toISOString() };
    const pending = join(path, `pending-${randomUUID()}.json`);
    write(pending, serialize(event));
    try { linkSync(pending, join(path, `${String(events.length + 1).padStart(10, '0')}.json`)); }
    catch (error) { unlinkSync(pending); if (error.code === 'EEXIST') return selectTake(input); throw error; }
    syncDirectory(path); unlinkSync(pending); syncDirectory(path);
    return event;
  }
  return {
    saveCandidate, loadCandidate, listCandidates, feedback: input => feedback(input), history,
    selectTake, selectionHistory,
    selections: () => readdirSync(join(root, 'selections')).filter(id => /^[a-f0-9]{32}$/.test(id)).map(id => selectionHistory(id).at(-1)).filter(Boolean),
    importHistory(candidateId, events) {
      if (!Array.isArray(events)) throw new Error("Invalid feedback history");
      events.forEach((event, index) => {
        check(validEvent, event);
        if (event.candidate_sha256 !== candidateId || event.supersedes !== (events[index - 1]?.event_id ?? null) ||
            events.slice(0, index).some(e => e.event_id === event.event_id)) throw new Error("Feedback history conflict");
      });
      const existing = history(candidateId);
      if (existing.length > events.length || existing.some((event, i) => serialize(event) !== serialize(events[i]))) throw new Error("Feedback import conflict");
      for (const event of events.slice(existing.length)) {
        const { timestamp, ...input } = event;
        const saved = feedback(input, timestamp);
        if (serialize(saved) !== serialize(event)) throw new Error("Feedback import conflict");
      }
      return history(candidateId);
    },
    readAsset(candidateId, asset) {
      if (!["source", "audio"].includes(asset)) throw new Error("Unknown candidate asset");
      const candidate = loadCandidate(candidateId, true);
      if (asset === "audio" && !candidate.evidence.cut) throw new Error("No delivered audio");
      const bytes = read(join(candidatePath(candidateId), `${asset}.wav`));
      const expected = asset === "source" ? candidate.evidence.generation.audio_sha256 : candidate.evidence.cut.audio_sha256;
      if (hash(bytes) !== expected) throw new Error("Candidate asset hash mismatch");
      return bytes;
    },
    evaluationData() {
      // Only explicit human events on non-fixture candidates qualify; imported reviews never do.
      return listCandidates().filter(candidate => !candidate.fixture).flatMap(candidate => {
        const events = history(candidate.candidate_sha256);
        return events.length ? [{ candidate, history: events, human: events.at(-1) }] : [];
      });
    },
  };
}
