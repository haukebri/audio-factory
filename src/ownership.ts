import { execFileSync } from "node:child_process";
import { sleep } from "./config.js";

export type Owner = { pid: number; identity: string };
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
