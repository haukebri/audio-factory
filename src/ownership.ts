import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { root, sleep } from "./config.js";

export type Owner = { pid: number; identity: string };
export function acquireCompute(inherited?: string) {
  const directory = `${root}/.runtime/compute-owners`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const owner = { pid: process.pid, identity: processIdentity(process.pid) };
  if (!owner.identity) throw new Error("Cannot establish compute ownership");
  const name = `${randomUUID()}.json`;
  const path = `${directory}/${name}`;
  writeFileSync(path, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
  const release = () => unlinkSync(path);
  try {
    // Immutable claims: concurrent contenders may both refuse, but cannot both win.
    for (const otherName of readdirSync(directory)) {
      if (otherName === name) continue;
      let other;
      try { other = JSON.parse(readFileSync(`${directory}/${otherName}`, "utf8")); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
      if (otherName === inherited && other.pid === process.ppid && other.identity === processIdentity(process.ppid)) continue;
      if (other.identity && processIdentity(other.pid) === other.identity)
        throw new Error("Local compute/backend already owned by a live process");
    }
  } catch (error) { release(); throw error; }
  return { name, owner, release };
}
// Call only while holding the checkout claim, before setup or generation.
export async function recoverBackend() {
  try {
    const owner = JSON.parse(await readFile(`${root}/.runtime/backend-owner.json`, "utf8"));
    if (owner.identity && processIdentity(owner.pid) === owner.identity &&
        (!owner.session?.identity || processIdentity(owner.session.pid) === owner.session.identity))
      throw new Error("Backend child has a live or unknown owning session; recovery refused");
    await stopOwned(owner);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export function processIdentity(pid: number): string | undefined {
  if (!Number.isSafeInteger(pid) || pid <= 1) return undefined;
  try {
    return (
      execFileSync("ps", ["-p", String(pid), "-o", "lstart=,command="], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}
export async function stopOwned(owner: Owner): Promise<boolean> {
  if (!owner.identity || processIdentity(owner.pid) !== owner.identity) return false;
  process.kill(owner.pid, "SIGTERM");
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    if (processIdentity(owner.pid) !== owner.identity) return true;
  }
  if (processIdentity(owner.pid) === owner.identity) process.kill(owner.pid, "SIGKILL");
  await sleep(100);
  return true;
}
