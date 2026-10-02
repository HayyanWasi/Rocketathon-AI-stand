"""
Turn detection: decide when the student starts and stops talking, from a live 16 kHz mic stream.

Silero VAD (pysilero-vad, ONNX/ggml, no torch) scores every 32 ms chunk. A turn starts after
START_MS of speech and ends after END_SILENCE_MS of silence (or MAX_TURN_S). A short pre-roll is
kept so the first syllable is not cut off.
"""
from dataclasses import dataclass, field

import numpy as np
from pysilero_vad import SileroVoiceActivityDetector

SAMPLE_RATE = 16000
CHUNK_SAMPLES = SileroVoiceActivityDetector.chunk_samples()  # 512 = 32 ms
CHUNK_BYTES = SileroVoiceActivityDetector.chunk_bytes()      # 16-bit mono
CHUNK_MS = CHUNK_SAMPLES * 1000 // SAMPLE_RATE


def rms_db(chunk: bytes) -> float:
    """Loudness of 16-bit PCM in dBFS (0 = full scale, quieter is more negative)."""
    x = np.frombuffer(chunk, dtype=np.int16).astype(np.float32)
    return float(20 * np.log10(np.sqrt(np.mean(x * x)) / 32768 + 1e-9))


@dataclass
class TurnConfig:
    speech_threshold: float = 0.5   # prob above this = speech
    silence_threshold: float = 0.35 # prob below this = silence (hysteresis in between)
    start_ms: int = 160             # this much speech starts a turn (ignores clicks/coughs)
    end_silence_ms: int = 600       # this much silence ends a turn
    preroll_ms: int = 320           # audio kept from before the start was detected
    max_turn_s: float = 20.0        # hard cap on one question
    # Silero scores how speech-LIKE a chunk is, not how loud. Faint speech (Sir's own voice leaking
    # from the speakers) scores as high as the student. When set, quieter chunks don't count as speech.
    min_rms_db: float | None = None


@dataclass
class TurnEvent:
    kind: str                       # "start" | "end"
    audio: bytes = b""              # the whole turn (16-bit PCM) on "end"
    duration_s: float = 0.0


@dataclass
class TurnDetector:
    cfg: TurnConfig = field(default_factory=TurnConfig)

    def __post_init__(self):
        self.vad = SileroVoiceActivityDetector()
        self.reset()

    def reset(self):
        self.vad.reset()
        self._pending = b""
        self._preroll: list[bytes] = []
        self._turn: list[bytes] = []
        self.speaking = False
        self._speech_ms = 0
        self._silence_ms = 0

    def feed(self, pcm: bytes) -> list[TurnEvent]:
        """Feed any amount of 16 kHz 16-bit mono PCM; returns turn events that happened."""
        events: list[TurnEvent] = []
        self._pending += pcm
        while len(self._pending) >= CHUNK_BYTES:
            chunk, self._pending = self._pending[:CHUNK_BYTES], self._pending[CHUNK_BYTES:]
            prob = self.vad.process_chunk(chunk)
            if self.cfg.min_rms_db is not None and rms_db(chunk) < self.cfg.min_rms_db:
                prob = 0.0
            ev = self._step(chunk, prob)
            if ev:
                events.append(ev)
        return events

    def _step(self, chunk: bytes, prob: float) -> TurnEvent | None:
        c = self.cfg
        if not self.speaking:
            self._preroll.append(chunk)
            if len(self._preroll) > c.preroll_ms // CHUNK_MS:
                self._preroll.pop(0)
            self._speech_ms = self._speech_ms + CHUNK_MS if prob >= c.speech_threshold else 0
            if self._speech_ms >= c.start_ms:
                self.speaking, self._silence_ms = True, 0
                self._turn, self._preroll = list(self._preroll), []
                return TurnEvent("start")
            return None

        self._turn.append(chunk)
        if prob < c.silence_threshold:
            self._silence_ms += CHUNK_MS
        elif prob >= c.speech_threshold:
            self._silence_ms = 0
        duration = len(self._turn) * CHUNK_MS / 1000
        if self._silence_ms >= c.end_silence_ms or duration >= c.max_turn_s:
            audio = b"".join(self._turn)
            self.speaking, self._turn, self._speech_ms = False, [], 0
            return TurnEvent("end", audio, duration)
        return None
