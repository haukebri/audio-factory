import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { hash, root } from './dist/config.js';

const policyBytes = readFileSync(new URL('./judge-policy.json', import.meta.url));
export const policy = JSON.parse(policyBytes);
const model = JSON.parse(readFileSync(new URL('./qa-model.lock.json', import.meta.url)));
// One owned process group includes the short-lived ffmpeg decoder.
export function scoreProcess(python, args, { timeout, signal }) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(python, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HF_HUB_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false' } });
    let stdout = '', stderr = '', failure;
    const stop = message => {
      failure ??= new Error(message);
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    };
    const abort = () => stop('Judge canceled');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => stop('Judge timeout'), timeout);
    child.stdout.on('data', bytes => { stdout += bytes; if (stdout.length > 1024 * 1024) stop('Judge output limit'); });
    child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-2000); });
    child.once('error', error => { failure = error; });
    child.once('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (failure || code !== 0) reject(failure ?? new Error(`Judge exited ${code}: ${stderr}`));
      else resolve({ stdout });
    });
  });
}

export function decide(result, target) {
  try { return applyPolicy(result, target); }
  catch { return { status: 'unavailable', decision: 'uncertain', reason_tags: ['invalid_scores'] }; }
}
function applyPolicy(result, target) {
  const unavailable = reason => ({ status: 'unavailable', decision: 'uncertain', reason_tags: [reason] });
  if (result?.clap?.status !== 'completed') return unavailable('scores_unavailable');
  const windows = result.clap.scores?.filter(row => row.kind === 'window');
  const descriptions = [...new Set([target, ...policy.alternatives])];
  if (!windows?.length || windows.length > 6 || descriptions.length < 2) return unavailable('invalid_scores');
  const scores = [], margins = [];
  for (const row of windows) {
    const ranking = row.ranking;
    if (!Array.isArray(ranking) || ranking.length !== descriptions.length ||
        new Set(ranking.map(r => r.description)).size !== descriptions.length ||
        !ranking.every(r => descriptions.includes(r.description) && Number.isFinite(r.similarity) && Math.abs(r.similarity) <= 1)) return unavailable('invalid_scores');
    const score = ranking.find(r => r.description === target).similarity;
    const margin = score - Math.max(...ranking.filter(r => r.description !== target).map(r => r.similarity));
    if (!Number.isFinite(row.target_margin) || Math.abs(row.target_margin - margin) > 1e-6) return unavailable('invalid_scores');
    scores.push(score); margins.push(margin);
  }
  if (![result.silence?.fraction, result.clipping_fraction, result.boundary_peak].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) return unavailable('signal_unavailable');
  const reasons = [];
  if (result.silence.fraction >= policy.silence_fraction) reasons.push('silence');
  if (result.clipping_fraction >= policy.clipping_fraction) reasons.push('clipping');
  if (Math.min(...scores) < policy.reject_score) reasons.push('low_similarity');
  if (Math.min(...margins) < policy.reject_margin) reasons.push('alternative_preferred');
  if (reasons.length) return { status: 'completed', decision: 'reject', reason_tags: reasons };
  if (result.boundary_peak > policy.boundary_peak) return { status: 'completed', decision: 'uncertain', reason_tags: ['active_boundary'] };
  if (Math.min(...scores) >= policy.accept_score && Math.min(...margins) >= policy.accept_margin)
    return { status: 'completed', decision: 'accept', reason_tags: ['score_and_margin_pass'] };
  return { status: 'completed', decision: 'uncertain', reason_tags: ['uncertainty_band'] };
}

export async function judge(path, target, { signal, timeout = 120000, python = `${root}/.runtime/qa-venv/bin/python` } = {}) {
  const started = Date.now();
  const audioHash = hash(await readFile(path));
  let result = null, error = null;
  try {
    const { stdout } = await scoreProcess(python, [`${root}/qa.py`, path, JSON.stringify({ clap: true, target, alternatives: policy.alternatives, delivered: true })],
      { timeout, signal });
    result = JSON.parse(stdout);
    if (result.audio_sha256 !== audioHash || hash(await readFile(path)) !== audioHash ||
        result.clap?.status === 'completed' && (result.clap.model.model !== model.model || result.clap.model.revision !== model.revision)) throw new Error('Judge input/model provenance mismatch');
  } catch (failure) { error = String(failure).slice(0, 2000); result = null; }
  const decision = decide(result, target);
  return { actor: 'automatic', audio_sha256: audioHash, model: model.model, revision: model.revision,
    rubric_sha256: hash(policyBytes), verdict: decision.decision === 'accept' ? 'auto_accepted' : decision.decision === 'reject' ? 'rejected' : 'needs_review',
    reason_tags: decision.reason_tags, note: 'Experimental score/signal policy. Human review remains separate.',
    evidence: { ...decision, policy, target, target_sha256: hash(target), descriptions_sha256: hash(JSON.stringify([target, ...policy.alternatives])),
      elapsed_ms: Date.now() - started, error, result } };
}
