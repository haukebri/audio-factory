import hashlib
import json
import pathlib
import subprocess
import sys
import time

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent
SETTINGS = json.loads((ROOT / 'qa-config.json').read_text())


def spans(mask):
    edges = np.diff(np.concatenate(([False], mask, [False])).astype(int))
    return list(zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)))


def signal_analysis(audio, rate, settings):
    frame = max(1, round(rate * settings['frame_ms'] / 1000))
    count = len(audio)
    energy = np.max(audio ** 2, axis=1)
    starts = np.arange(0, count, frame)
    sizes = np.minimum(frame, count - starts)
    rms = np.sqrt(np.add.reduceat(energy, starts) / sizes)
    silent = rms < 10 ** (settings['silence_db'] / 20)
    for a, b in spans(silent):
        if a > 0 and b < len(silent) and (b - a) * frame / rate < settings['minimum_gap_ms'] / 1000:
            silent[a:b] = False
    regions = []
    margin = settings['margin_ms'] / 1000
    for a, b in spans(~silent):
        regions.append({'start_seconds': max(0, a * frame / rate - margin),
                        'end_seconds': min(count / rate, b * frame / rate + margin)})
    gaps = [{'start_seconds': a * frame / rate, 'end_seconds': min(count, b * frame) / rate}
            for a, b in spans(silent)]
    leading = gaps[0]['end_seconds'] if gaps and gaps[0]['start_seconds'] == 0 else 0
    trailing = count / rate - gaps[-1]['start_seconds'] if gaps and gaps[-1]['end_seconds'] == count / rate else 0
    rhythm = []
    width = round(rate * settings['rhythm_window_seconds'])
    for start in range(0, count - width + 1, width):
        segment = audio[start:start + width]
        spectrum = np.fft.rfft(segment, axis=0)
        frequencies = np.fft.rfftfreq(width, 1 / rate)
        keep = (frequencies >= settings['bass_min_hz']) & (frequencies <= settings['bass_max_hz'])
        bass = np.fft.irfft(spectrum * keep[:, None], n=width, axis=0)
        ratio = float(np.sum(bass ** 2) / max(np.sum(segment ** 2), 1e-20))
        hop = max(1, round(rate / 200))
        envelope = np.sqrt(np.mean(bass[:width // hop * hop].reshape(-1, hop, audio.shape[1]) ** 2, axis=(1, 2)))
        modulation = float(np.std(envelope) / max(np.mean(envelope), 1e-12))
        centered = envelope - np.mean(envelope)
        correlation = np.correlate(centered, centered, mode='full')[len(centered) - 1:]
        correlation /= max(correlation[0], 1e-20)
        lo = max(1, round(rate / hop / settings['rhythm_max_hz']))
        hi = min(len(correlation), round(rate / hop / settings['rhythm_min_hz']) + 1)
        lag = lo + int(np.argmax(correlation[lo:hi]))
        strength = float(correlation[lag])
        stride = max(1, round(rate / 2000))
        wave = bass[::stride]
        wave_ac = sum(np.correlate(wave[:, channel], wave[:, channel], mode='full')[len(wave) - 1:] for channel in range(audio.shape[1]))
        wave_ac /= max(wave_ac[0], 1e-20)
        wave_lo = max(1, round(rate / stride / settings['rhythm_max_hz']))
        wave_hi = min(len(wave_ac), round(rate / stride / settings['rhythm_min_hz']) + 1)
        wave_lag = wave_lo + int(np.argmax(wave_ac[wave_lo:wave_hi]))
        wave_strength = float(wave_ac[wave_lag])
        suspected = ratio >= settings['rhythm_min_energy_ratio'] and modulation >= settings['rhythm_min_modulation'] and (strength >= settings['rhythm_min_correlation'] or wave_strength >= settings['rhythm_min_wave_correlation'])
        rhythm.append({'start_seconds': start / rate, 'end_seconds': (start + width) / rate,
                       'bass_energy_ratio': ratio, 'correlation': strength, 'modulation': modulation,
                       'pulse_hz': rate / hop / lag, 'wave_correlation': wave_strength, 'wave_pulse_hz': rate / stride / wave_lag, 'suspected': bool(suspected)})
    persistence = sum(row['suspected'] for row in rhythm) / max(1, len(rhythm))
    return {'duration_seconds': count / rate, 'peak': float(np.max(np.abs(audio))),
            'silence': {'leading_seconds': leading, 'trailing_seconds': trailing,
                        'fraction': sum(g['end_seconds'] - g['start_seconds'] for g in gaps) / (count / rate), 'gaps': gaps},
            'regions': regions, 'rhythm': {'suspected': bool(len(rhythm) >= 2 and persistence >= settings['rhythm_min_persistence']),
                                         'persistence': persistence, 'windows': rhythm}}


class Clap:
    def __init__(self):
        import torch
        from transformers import ClapModel, ClapProcessor
        manifest = json.loads((ROOT / '.runtime/qa-model.json').read_text())
        for file in manifest['files']:
            if hashlib.sha256(pathlib.Path(file['path']).read_bytes()).hexdigest() != file['sha256']:
                raise ValueError('CLAP model hash mismatch: ' + file['path'])
        expected = json.loads((ROOT / 'qa-model.lock.json').read_text())
        if manifest['revision'] != expected['revision'] or manifest['model'] != expected['model']:
            raise ValueError('CLAP revision mismatch')
        if {pathlib.Path(f['path']).name: f['sha256'] for f in manifest['files']} != {f['file']: f['sha256'] for f in expected['files']}:
            raise ValueError('CLAP manifest differs from pinned hashes')
        import importlib.metadata
        for line in (ROOT / 'qa-requirements.lock').read_text().splitlines():
            if '==' in line:
                name, version = line.split('==')
                if importlib.metadata.version(name) != version:
                    raise ValueError('QA dependency mismatch: ' + name)
        self.torch = torch
        self.manifest = manifest
        self.processor = ClapProcessor.from_pretrained(manifest['path'], local_files_only=True)
        self.model = ClapModel.from_pretrained(manifest['path'], local_files_only=True).eval().to('cpu')

    def score(self, path, regions, target, alternatives):
        labels = list(dict.fromkeys([target] + alternatives))
        raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], timeout=30)
        audio = np.frombuffer(raw, dtype='<f4')
        duration = len(audio) / 48000
        windows = [(start, min(start + 10, duration), 'window') for start in np.arange(0, duration, 5) if start == 0 or start + 5 < duration]
        windows += [(float(start), min(float(start) + 10, r['end_seconds']), 'region') for r in regions[:32] for start in np.arange(r['start_seconds'], r['end_seconds'], 10)]
        text = self.processor(text=labels, return_tensors='pt', padding=True, truncation=True)
        with self.torch.inference_mode():
            embeddings = self.model.get_text_features(**text)
            embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
            scores = []
            for start, end, kind in windows:
                samples = audio[round(start * 48000):round(end * 48000)]
                inputs = self.processor(audio=samples, sampling_rate=48000, return_tensors='pt', padding='repeatpad')
                features = self.model.get_audio_features(**inputs)
                features = features / features.norm(dim=-1, keepdim=True)
                values = (features @ embeddings.T)[0].tolist()
                ranked = sorted(zip(labels, values), key=lambda pair: -pair[1])
                scores.append({'start_seconds': float(start), 'end_seconds': float(end), 'kind': kind,
                               'ranking': [{'description': label, 'similarity': value} for label, value in ranked],
                               'target_margin': values[0] - max(values[1:]) if len(values) > 1 else None})
        return {'status': 'completed', 'model': self.manifest, 'scores': scores, 'meaning': 'relative similarity; not correctness probability'}


def analyze(path, request, clap=None):
    started = time.monotonic()
    audio, rate = sf.read(path, always_2d=True)
    if not len(audio) or not np.isfinite(audio).all():
        raise ValueError('Empty or nonfinite audio')
    result = signal_analysis(audio, rate, SETTINGS)
    result['clap'] = {'status': 'disabled'}
    if request.get('clap'):
        try:
            result['clap'] = (clap or Clap()).score(path, result['regions'], request['target'], request.get('alternatives', []))
        except Exception as error:
            result['clap'] = {'status': 'failed', 'error': str(error)}
    result['elapsed_ms'] = round((time.monotonic() - started) * 1000)
    return result


if __name__ == '__main__':
    path = pathlib.Path(sys.argv[1]).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('Analysis input must be within the factory')
    print(json.dumps(analyze(path, json.loads(sys.argv[2]))))
