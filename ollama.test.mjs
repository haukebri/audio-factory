import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Ollama } from './dist/ollama.js';

// Exercise real child processes and HTTP readiness without loading a model.
test('Ollama owns startup/shutdown, reuses external daemons, and cleans up failed startup', async () => {
  const url = 'http://127.0.0.1:11434/api/tags';
  assert.equal(await fetch(url).then(() => true, () => false), false, 'Stop Ollama before this lifecycle check');
  const directory = await mkdtemp(join(tmpdir(), 'ollama-lifecycle-'));
  const originalPath = process.env.PATH;
  const owned = new Ollama(), reused = new Ollama(), missing = new Ollama();
  try {
    await writeFile(join(directory, 'ollama'), `#!${process.execPath}
const { createServer } = require('node:http');
createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({models: process.env.OLLAMA_TEST_MISSING ? [] : [{name: 'gemma4:latest'}]}));
}).listen(11434, '127.0.0.1');
`);
    await chmod(join(directory, 'ollama'), 0o700);
    process.env.PATH = directory;
    await owned.start();
    await reused.start();
    await reused.stop();
    assert.equal((await fetch(url)).status, 200, 'Borrower must leave the daemon running');
    await owned.stop();
    await owned.stop();
    assert.equal(await fetch(url).then(() => true, () => false), false, 'Owner must reap the daemon');
    process.env.OLLAMA_TEST_MISSING = '1';
    await assert.rejects(missing.start(), /ollama pull gemma4:latest/);
    assert.equal(await fetch(url).then(() => true, () => false), false, 'Failed startup must reap its daemon');
  } finally {
    await Promise.all([owned.stop(), reused.stop(), missing.stop()]);
    process.env.PATH = originalPath;
    delete process.env.OLLAMA_TEST_MISSING;
    await rm(directory, { recursive: true, force: true });
  }
});
