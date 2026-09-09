import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { verifyExport } from "./export-lineage.mjs";

const [root, serializedCut] = process.argv.slice(2);
const cut = JSON.parse(serializedCut);
if (!/^[a-f0-9]{32}$/.test(cut.run_id) || !/^[a-f0-9]{32}$/.test(cut.id))
  throw new Error("Invalid cut identity");
const runDirectory = `${root}/out/runs/${cut.run_id}`;
const cutDirectory = `${runDirectory}/cuts/${cut.id}`;
const generation = JSON.parse(await readFile(`${runDirectory}/run.json`, "utf8"));
const audio = await readFile(`${cutDirectory}/audio.wav`);
const original = await readFile(`${runDirectory}/audio.wav`);
const analyses = [];
let ids = [];
try {
  ids = await readdir(`${runDirectory}/analyses`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const id of ids.sort()) {
  if (!/^[a-f0-9]{32}$/.test(id)) continue;
  try {
    analyses.push(JSON.parse(await readFile(`${runDirectory}/analyses/${id}/report.json`, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const retained = analyses.slice(-32);
const review = {
  status: "provisional",
  rationale: "Prepared export; developer agent evaluates QA and listening evidence before use.",
  analysis_ids: retained.map((a) => a.id),
};
const record = {
  schema: "urban:audio-factory-export@1",
  source_file: `${cut.id}-source.wav`,
  generation,
  cut,
  analyses: retained,
  review,
};
verifyExport(record, audio, () => original);
const bundleId = createHash("sha256").update(JSON.stringify(record)).digest("hex").slice(0, 16);
const directory = `${cutDirectory}/bundles/${bundleId}`;
await mkdir(directory, { recursive: true });
async function preserve(name, bytes) {
  const path = `${directory}/${name}`;
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (!readFileSync(path).equals(Buffer.from(bytes)))
      throw new Error(`Existing bundle differs: ${path}`);
  }
  return path;
}
const sourcePath = await preserve(record.source_file, original);
const audioPath = await preserve(`${cut.id}.wav`, audio);
const metadata = await preserve(`${cut.id}.json`, `${JSON.stringify(record)}\n`);
console.log(JSON.stringify({ audio: audioPath, metadata, original: sourcePath }));
