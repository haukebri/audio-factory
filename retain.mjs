import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyExport } from "./export-lineage.mjs";

const audio = resolve(process.argv[2] ?? "");
if (!/^[a-f0-9]{32}\.wav$/.test(basename(audio)))
  throw new Error("retain requires a factory export audio path");
const metadata = audio.replace(/\.wav$/, ".json");
const record = JSON.parse(readFileSync(metadata, "utf8"));
verifyExport(record, readFileSync(audio), (file) => readFileSync(join(dirname(audio), file)));
const root = fileURLToPath(new URL("./", import.meta.url));
mkdirSync(`${root}/.runtime/retained`, { recursive: true });
const destination = mkdtempSync(`${root}/.runtime/retained/clip-`);
for (const path of [audio, metadata, join(dirname(audio), record.source_file)])
  copyFileSync(path, join(destination, basename(path)));
console.log(JSON.stringify({ audio: join(destination, basename(audio)) }));
