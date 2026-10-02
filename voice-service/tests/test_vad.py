import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import config
from vad import SAMPLE_RATE, TurnDetector

needs_voice = pytest.mark.skipif(not config.VOICE_MODEL.exists(), reason="voice model not copied into models/")


def pcm16(x: np.ndarray) -> bytes:
    return (np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()


def silence(seconds: float) -> bytes:
    return np.zeros(int(seconds * SAMPLE_RATE), dtype=np.int16).tobytes()


@pytest.fixture(scope="module")
def spoken_question() -> bytes:
    """A real-sounding question (Sir's cloned voice), resampled to 16 kHz."""
    from piper import PiperVoice
    voice = PiperVoice.load(str(config.VOICE_MODEL))
    a = np.concatenate([c.audio_float_array for c in voice.synthesize("سر، diffraction کیا ہوتا ہے؟ ذرا سمجھا دیں۔")])
    n = int(len(a) * SAMPLE_RATE / voice.config.sample_rate)
    return pcm16(np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a))


def feed_in_random_sizes(det: TurnDetector, audio: bytes, seed=0):
    rng, events, i = np.random.default_rng(seed), [], 0
    while i < len(audio):
        n = int(rng.integers(200, 3000)) * 2  # browsers send odd-sized frames
        events += det.feed(audio[i:i + n])
        i += n
    return events


def test_silence_and_noise_make_no_turn():
    det = TurnDetector()
    noise = pcm16(np.random.default_rng(1).normal(0, 0.005, SAMPLE_RATE * 3))
    assert feed_in_random_sizes(det, silence(2) + noise + silence(1)) == []


@needs_voice
def test_one_question_is_one_turn(spoken_question):
    det = TurnDetector()
    events = feed_in_random_sizes(det, silence(1) + spoken_question + silence(1.5))
    assert [e.kind for e in events] == ["start", "end"]
    speech_s = len(spoken_question) / 2 / SAMPLE_RATE
    # the turn holds the whole question (+ pre-roll and the trailing silence that ended it)
    assert speech_s - 0.3 <= events[1].duration_s <= speech_s + 1.2


@needs_voice
def test_loudness_gate_ignores_faint_speaker_echo(spoken_question):
    from vad import TurnConfig, rms_db
    faint = (np.frombuffer(spoken_question, dtype=np.int16) * 0.06).astype(np.int16).tobytes()  # ~-24 dB
    assert rms_db(faint) < -32 < rms_db(spoken_question)
    gated = TurnConfig(speech_threshold=0.75, start_ms=320, min_rms_db=-32)
    assert feed_in_random_sizes(TurnDetector(gated), silence(0.5) + faint + silence(1)) == []
    events = feed_in_random_sizes(TurnDetector(gated), silence(0.5) + spoken_question + silence(1))
    assert [e.kind for e in events] == ["start", "end"]


@needs_voice
def test_two_questions_with_a_pause_are_two_turns(spoken_question):
    det = TurnDetector()
    events = feed_in_random_sizes(det, spoken_question + silence(1.2) + spoken_question + silence(1.2))
    assert [e.kind for e in events] == ["start", "end", "start", "end"]
