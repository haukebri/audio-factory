import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

export const root = fileURLToPath(new URL("../", import.meta.url));
export type Config = {
  runtime_revision: string;
  models: { file: string; url: string; sha256: string; bytes: number }[];
  port: number;
  timeout_ms: number;
  idle_ms: number;
  steps: number;
  duration_padding_sec: number;
  peak_db: number;
  default_duration_seconds: number;
  max_duration_seconds: number;
  licenses: { name: string; url: string }[];
};
export const config: Config = JSON.parse(readFileSync(`${root}/config.json`, "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validConfig = ajv.compile(JSON.parse(readFileSync(`${root}/config.schema.json`, "utf8")));
if (!validConfig(config)) throw new Error(JSON.stringify(validConfig.errors));
export const validateRequest = ajv.compile(
  JSON.parse(readFileSync(`${root}/request.schema.json`, "utf8")),
);
export const validateRun = ajv.compile(JSON.parse(readFileSync(`${root}/run.schema.json`, "utf8")));
export type Request = { prompt: string; duration_seconds: number; seed?: number };
export const hash = (data: string | Buffer): string =>
  createHash("sha256").update(data).digest("hex");
export const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
