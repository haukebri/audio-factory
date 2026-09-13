// Live search/UI check. Start the standalone server first; requires agent-browser.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const session = 'scout-player-check';
const run = (...args) => {
  const reply = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], { encoding: 'utf8', timeout: 70000 }));
  if (!reply.success) throw new Error(reply.error);
  return reply.data;
};
const evaluate = code => run('eval', code).result;
try {
  run('open', 'http://127.0.0.1:8768');
  run('fill', '#query', 'metal gate latch sound effect'); run('click', '#search-button');
  run('wait', '--fn', 'document.querySelectorAll(".result button").length > 1 && !document.querySelector("#video-preview").hidden');
  const first = evaluate('document.querySelector("#youtube-player").src');
  assert.equal(new URL(first).searchParams.get('autoplay'), '0');
  run('click', '.result:nth-child(2) button');
  const next = evaluate('({src:document.querySelector("#youtube-player").src,url:document.querySelector("#video-url").value,frames:document.querySelectorAll("iframe").length})');
  assert.notEqual(next.src, first); assert.equal(next.frames, 1);
  assert.equal(new URL(next.src).pathname, '/embed/' + new URL(next.url).searchParams.get('v'));
  assert.equal(new URL(next.src).searchParams.get('autoplay'), '1');
  // The media play event must stop the remote video before local audio takes over.
  evaluate('document.querySelector("#player").dispatchEvent(new Event("play"))');
  assert.deepEqual(evaluate('({hidden:document.querySelector("#video-preview").hidden,source:document.querySelector("#youtube-player").getAttribute("src")})'), { hidden: true, source: null });
  run('click', '.result:first-child button'); run('click', '#close-preview');
  assert.equal(evaluate('document.querySelector("#youtube-player").hasAttribute("src")'), false);
  run('set', 'viewport', '390', '844'); run('click', '.result:first-child button');
  assert.equal(evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  assert.ok(evaluate('document.querySelector("#youtube-player").getBoundingClientRect().height') >= 200);
  console.log('Passed embedded selection, URL sync, single player, close/audio handoff and mobile sizing.');
} finally { run('close'); }
