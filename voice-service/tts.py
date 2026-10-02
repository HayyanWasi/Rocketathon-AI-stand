"""Sir Mahad's cloned voice (Piper), loaded once and kept warm."""
import io
import threading
import wave
from typing import Iterator

from piper import PiperVoice, SynthesisConfig

import config
from text_norm import normalize


class TeacherVoice:
    def __init__(self, model_path=config.VOICE_MODEL):
        if not model_path.exists():
            raise FileNotFoundError(
                f"Voice model not found: {model_path}\n"
                "Copy ur_PK-sirmahad-medium.onnx and .onnx.json into voice-service/models/"
            )
        self.voice = PiperVoice.load(str(model_path))
        self.sample_rate = self.voice.config.sample_rate
        self.syn_config = SynthesisConfig(length_scale=config.VOICE_SPEED, noise_scale=config.VOICE_NOISE)
        self._lock = threading.Lock()  # one ONNX session; serialize requests
        self.name = model_path.stem
        # warm-up: first inference is slow (graph init), do it before the first student talks
        for _ in self.stream("ٹھیک ہے۔"):
            pass

    def stream(self, text: str) -> Iterator[tuple[int, bytes]]:
        """Yield (sentence index, 16-bit mono PCM) one sentence at a time, so playback can start early."""
        clean = normalize(text)
        if not clean:
            return
        with self._lock:
            for i, chunk in enumerate(self.voice.synthesize(clean, syn_config=self.syn_config)):
                yield i, chunk.audio_int16_bytes

    def wav(self, text: str) -> bytes:
        """Whole answer as one WAV file (for the simple HTTP endpoint)."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            for _, pcm in self.stream(text):
                wf.writeframes(pcm)
        return buf.getvalue()
