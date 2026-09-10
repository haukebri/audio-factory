import hashlib
import json
import pathlib
import sys
import time

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent
SETTINGS = json.loads((ROOT / 'qa-config.json').read_text())


def spans(mask):
    edges = np.diff(np.concatenate(([False], mask, [False])).astype(int))
    return list(zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)))


def static_analysis(audio, rate, settings):
    # Conservative steady broadband-noise flag, not semantic sound recognition.
    width = rate
    windows = []
    for start in range(0, len(audio), max(1, width // 2)):
        segment = audio[start:start + width]
        if len(segment) < rate // 2:
            continue
        n = 2048
        frames = np.lib.stride_tricks.sliding_window_view(segment, n, axis=0)[::n // 2]
        spectrum = np.mean(np.abs(np.fft.rfft((frames - frames.mean(axis=-1, keepdims=True)) * np.hanning(n), axis=-1)) ** 2, axis=(0, 1))
        frequencies = np.fft.rfftfreq(n, 1 / rate)
        power = spectrum[(frequencies >= 100) & (frequencies <= min(16000, rate / 2))]
        flatness = float(np.exp(np.mean(np.log(np.maximum(power, 1e-20)))) / max(np.mean(power), 1e-20))
        hop = max(1, round(rate * .02))
        rms = np.sqrt(np.mean(segment[:len(segment) // hop * hop].reshape(-1, hop, audio.shape[1]) ** 2, axis=(1, 2)))
        variation = float(np.std(rms) / max(np.mean(rms), 1e-20))
        audible = float(np.mean(rms)) >= 10 ** (settings['silence_db'] / 20)
        windows.append({'start_seconds': start / rate, 'flatness': flatness, 'rms_variation': variation,
                        'suspected': bool(audible and flatness >= settings['static_flatness'] and variation <= settings['static_rms_variation'])})
    fraction = sum(w['suspected'] for w in windows) / max(1, len(windows))
    return {'version': 1, 'suspected': bool(windows and fraction >= settings['static_persistence']), 'fraction': fraction, 'windows': windows}


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
            'clipping_fraction': float(np.mean(np.abs(audio) >= 0.999)),
            'boundary_peak': float(np.max(np.abs(audio[[0, -1]]))),
            'silence': {'leading_seconds': leading, 'trailing_seconds': trailing,
                        'fraction': sum(g['end_seconds'] - g['start_seconds'] for g in gaps) / (count / rate), 'gaps': gaps},
            'regions': regions, 'static': static_analysis(audio, rate, settings), 'rhythm': {'suspected': bool(len(rhythm) >= 2 and persistence >= settings['rhythm_min_persistence']),
                                         'persistence': persistence, 'windows': rhythm}}


def analyze(path, request):
    if request.get("clap") or request.get("target") or request.get("alternatives"):
        raise ValueError("Semantic QA was removed; use deterministic signal checks")
    started = time.monotonic()
    audio, rate = sf.read(path, always_2d=True)
    if not len(audio) or not np.isfinite(audio).all():
        raise ValueError('Empty or nonfinite audio')
    result = signal_analysis(audio, rate, SETTINGS)
    result['audio_sha256'] = hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
    result['elapsed_ms'] = round((time.monotonic() - started) * 1000)
    return result


if __name__ == '__main__':
    path = pathlib.Path(sys.argv[1]).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('Analysis input must be within the factory')
    print(json.dumps(analyze(path, json.loads(sys.argv[2]))))
