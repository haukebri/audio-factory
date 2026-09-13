// Tool setup is separate from accepted audio work. Keep the previous runtime for rollback.
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from '../dist/config.js';
import { acquireCompute, processIdentity } from '../dist/ownership.js';
import { readiness, run, runtime } from '../youtube.mjs';
const claim = acquireCompute();
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
const current = join(runtime, 'venv'), previous = join(runtime, 'previous-venv'), installing = join(runtime, 'installing');
try {
  const owners = join(root, '.runtime/studio/owners');
  for (const file of await readdir(owners).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    const owner = JSON.parse(await readFile(join(owners, file), 'utf8'));
    if (owner.identity && processIdentity(owner.pid) === owner.identity) throw new Error('Stop Studio before updating YouTube tools. Saved audio is unaffected.');
  }
  await mkdir(runtime, { recursive: true });
  if (existsSync(installing)) {
    await rm(current, { recursive: true, force: true });
    if (existsSync(previous)) await rename(previous, current);
    await rm(installing);
  }
  if (!existsSync(current) && existsSync(previous)) await rename(previous, current);
  if (process.argv.includes('--rollback')) {
    if (!existsSync(previous)) throw new Error('No previous extractor runtime is available');
    await rm(current, { recursive: true, force: true }); await rename(previous, current);
    console.log('Previous YouTube runtime restored.');
  } else {
    const ready = await readiness();
    if (ready.tools.find(t => t.name === 'yt-dlp')?.error) {
      if (existsSync(current)) {
        await rm(previous, { recursive: true, force: true });
        await rename(current, previous);
      }
      await writeFile(installing, 'Restore previous-venv if this setup is interrupted.', { flag: 'wx' });
      try {
        await run('uv', ['venv', current], { signal: controller.signal });
        await run('uv', ['pip', 'install', '--python', join(current, 'bin/python'), 'yt-dlp[default]==2026.8.19', 'yt-dlp-ejs==0.8.0'], { signal: controller.signal, timeout: 300000 });
        const installed = await readiness();
        if (installed.tools.find(t => t.name === 'yt-dlp')?.error) throw new Error('Pinned extractor verification failed');
      } catch (error) {
        await rm(current, { recursive: true, force: true });
        if (existsSync(previous)) await rename(previous, current);
        throw error;
      } finally { await rm(installing, { force: true }); }
    }
    const result = await readiness();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  }
} finally { claim.release(); }
