import unittest
import tempfile
from unittest.mock import patch
import soundfile as sf
import numpy as np
from qa import signal_analysis, SETTINGS, analyze


class SignalChecks(unittest.TestCase):
    def test_silence_boundaries_and_periodic_counterexamples(self):
        rate = 44100
        rng = np.random.default_rng(4)
        audio = np.zeros((rate * 3, 2))
        event = rng.normal(0, 0.05, rate)
        audio[rate:rate * 2, 0] = event
        audio[rate:rate * 2, 1] = -event
        result = signal_analysis(audio, rate, SETTINGS)
        self.assertAlmostEqual(result['silence']['leading_seconds'], 1, delta=.03)
        self.assertAlmostEqual(result['silence']['trailing_seconds'], 1, delta=.03)
        self.assertEqual(len(result['regions']), 1)
        self.assertFalse(result['rhythm']['suspected'])
        self.assertEqual(signal_analysis(audio * 0, rate, SETTINGS)['regions'], [])
        t = np.arange(rate * 4) / rate
        pulsing = .2 * np.sin(2 * np.pi * 90 * t) * (1 + np.sin(2 * np.pi * 12 * t))
        result = signal_analysis(np.column_stack([pulsing, pulsing]), rate, SETTINGS)
        self.assertTrue(result['rhythm']['suspected'])
        steady = .2 * np.sin(2 * np.pi * 90 * t)
        self.assertFalse(signal_analysis(np.column_stack([steady, steady]), rate, SETTINGS)['rhythm']['suspected'])

    def test_static_and_hiss_counterexamples(self):
        rate = 44100
        rng = np.random.default_rng(7)
        white = rng.normal(0, .05, (rate * 3, 2))
        self.assertTrue(signal_analysis(white, rate, SETTINGS)['static']['suspected'])
        self.assertFalse(signal_analysis(white * 0, rate, SETTINGS)['static']['suspected'])
        # Colored and time-varying noise resemble hiss/rain; do not reject these as static.
        colored = np.diff(white, axis=0)
        self.assertFalse(signal_analysis(colored, rate, SETTINGS)['static']['suspected'])
        envelope = (.1 + np.sin(np.arange(len(white)) / rate * 5) ** 2)[:, None]
        self.assertFalse(signal_analysis(white * envelope, rate, SETTINGS)['static']['suspected'])
        with tempfile.NamedTemporaryFile(suffix='.wav') as file:
            sf.write(file.name, white * 0, rate)
            with self.assertRaisesRegex(ValueError, 'Semantic QA was removed'):
                analyze(file.name, {'clap': True, 'target': 'A cat hissing'})
            self.assertEqual(analyze(file.name, {})['regions'], [])


if __name__ == '__main__':
    unittest.main()
