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

    def test_unavailable_clap_preserves_signal_analysis(self):
        with tempfile.NamedTemporaryFile(suffix='.wav') as file:
            sf.write(file.name, np.zeros((44100, 2)), 44100)
            with patch('qa.Clap', side_effect=RuntimeError('model unavailable')):
                result = analyze(file.name, {'clap': True, 'target': 'A cat hissing'})
            self.assertEqual(result['clap']['status'], 'failed')
            self.assertEqual(result['silence']['fraction'], 1)
            self.assertEqual(result['regions'], [])


if __name__ == '__main__':
    unittest.main()
