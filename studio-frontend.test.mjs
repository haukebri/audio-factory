import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('user actions wait for background work instead of disappearing', async () => {
  const source = readFileSync(new URL('./studio.js', import.meta.url), 'utf8');
  const context = vm.createContext({ setTimeout });
  vm.runInContext(`let busy = false, pendingAction = Promise.resolve(); const say = () => {}; ${source.slice(source.indexOf('function action('), source.indexOf('function node('))}`, context);
  const result = await vm.runInContext(`(async () => {
    let ran = false;
    const background = action(() => new Promise(resolve => setTimeout(resolve, 30)));
    await action(async () => { ran = true; });
    await background;
    return ran;
  })()`, context);
  assert.equal(result, true);
});
