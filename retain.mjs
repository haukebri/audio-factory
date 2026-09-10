import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyExport } from "./export-lineage.mjs";

const audio = resolve(process.argv[2] ?? "");
const root = fileURLToPath(new URL("./", import.meta.url));
if (['source.wav', 'audio.wav'].includes(basename(audio)) && /^[a-f0-9]{64}$/.test(basename(dirname(audio)))) {
  const { openReviewStore } = await import('./review-store.mjs');
  const store = openReviewStore(resolve(dirname(audio), '../..'));
  const id = basename(dirname(audio));
  const candidate = store.loadCandidate(id);
  const asset = basename(audio) === 'source.wav' ? 'source' : 'audio';
  const bytes = store.readAsset(id, asset);
  mkdirSync(`${root}/.runtime/retained`, { recursive: true });
  const destination = mkdtempSync(`${root}/.runtime/retained/clip-`);
  writeFileSync(join(destination, 'audio.wav'), bytes);
  writeFileSync(join(destination, 'source.wav'), store.readAsset(id, 'source'));
  const { candidate_sha256, ...record } = candidate;
  writeFileSync(join(destination, 'candidate.json'), JSON.stringify(record, null, 2));
  writeFileSync(join(destination, 'feedback.json'), JSON.stringify(store.history(id), null, 2));
  const selections = store.selections().filter(s => store.selectionHistory(s.sound_id).some(e => e.candidate_sha256 === id));
  writeFileSync(join(destination, 'selection-history.json'), JSON.stringify(selections.flatMap(s => store.selectionHistory(s.sound_id)), null, 2));
  console.log(JSON.stringify({ audio: join(destination, 'audio.wav'), candidate_sha256 }));
  process.exit(0);
}
if (!/^[a-f0-9]{32}\.wav$/.test(basename(audio)))
  throw new Error("retain requires a factory export audio path");
const metadata = audio.replace(/\.wav$/, ".json");
const record = JSON.parse(readFileSync(metadata, "utf8"));
verifyExport(record, readFileSync(audio), (file) => readFileSync(join(dirname(audio), file)));
mkdirSync(`${root}/.runtime/retained`, { recursive: true });
const destination = mkdtempSync(`${root}/.runtime/retained/clip-`);
for (const path of [audio, metadata, join(dirname(audio), record.source_file)])
  copyFileSync(path, join(destination, basename(path)));
console.log(JSON.stringify({ audio: join(destination, basename(audio)) }));
