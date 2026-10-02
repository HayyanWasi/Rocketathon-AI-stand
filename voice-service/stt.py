"""
Speech-to-text for the student's question.

1. Groq Whisper large-v3 (free API key, online) -- good Urdu, ~0.5 s.
2. Local faster-whisper (CPU int8, always loaded) -- automatic fallback when there is no key,
   no internet, or Groq errors. Weak at Urdu on a laptop CPU, but the call never stops.
"""
import io
import json
import re
import threading
import time
import urllib.error
import urllib.request
import uuid
import wave
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from faster_whisper import WhisperModel

import config


# Devanagari, Gurmukhi: Whisper's usual wrong guesses for spoken Urdu
_WRONG_SCRIPT = re.compile("[ऀ-ॿ਀-੿]")
_OK_LANGUAGES = {"ur", "en"}


def _wav_bytes(pcm16: bytes, rate=16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm16)
    return buf.getvalue()


class GroqWhisper:
    URL = "https://api.groq.com/openai/v1/audio/transcriptions"
    COOLDOWN_S = 60  # after a network failure, skip Groq for a while instead of waiting on timeouts

    def __init__(self, key: str):
        self.key = key
        self._down_until = 0.0

    @property
    def usable(self) -> bool:
        return bool(self.key) and time.monotonic() >= self._down_until

    def transcribe(self, pcm16: bytes) -> str:
        """Students mix Urdu and English. Language auto-detect sometimes calls mixed Urdu "English" or
        writes it in Hindi script; forcing Urdu garbles all-English questions. So both are requested
        at the same time (no extra waiting) and the one Whisper is more confident about wins."""
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self._request, pcm16, lang) for lang in (None, "ur")]
            results, errors = [], []
            for f in futures:
                try:
                    results.append(f.result())
                except RuntimeError as e:
                    errors.append(e)
        if not results:
            raise errors[0]
        # Auto-detect sometimes picks Turkish/Hindi/Punjabi for mixed Urdu: only Urdu or English count.
        good = [r for r in results if r[2] in _OK_LANGUAGES and not _WRONG_SCRIPT.search(r[0])] or results
        return max(good, key=lambda r: r[1])[0]

    def _request(self, pcm16: bytes, language: str | None) -> tuple[str, float, str]:
        """-> (text, confidence = mean avg_logprob of the segments (higher is better), language)."""
        fields = {"model": config.GROQ_MODEL, "response_format": "verbose_json", "temperature": "0"}
        if language:
            fields["language"] = language
        if config.STT_PROMPT:
            fields["prompt"] = config.STT_PROMPT
        boundary = uuid.uuid4().hex
        body = b"".join(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
            for k, v in fields.items()
        )
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="question.wav"\r\n'
                 f"Content-Type: audio/wav\r\n\r\n").encode() + _wav_bytes(pcm16) + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(self.URL, data=body, method="POST", headers={
            "Authorization": f"Bearer {self.key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            # Groq's Cloudflare blocks the default "Python-urllib" agent (HTTP 403, error code 1010)
            "User-Agent": "rocketathon-voice-service/1.0",
            "Accept": "application/json",
        })
        try:
            with urllib.request.urlopen(req, timeout=config.GROQ_TIMEOUT_S) as r:
                data = json.loads(r.read())
            logprobs = [s["avg_logprob"] for s in data.get("segments") or [] if "avg_logprob" in s]
            lang = str(data.get("language") or language or "").strip().lower()[:2]  # "Urdu"/"ur" -> "ur"
            return data["text"].strip(), (sum(logprobs) / len(logprobs) if logprobs else -9.0), lang
        except urllib.error.HTTPError as e:
            if e.code == 401:
                self.key = ""  # invalid key: stop trying until restart
            elif e.code in (403, 429) or e.code >= 500:
                self._down_until = time.monotonic() + 20  # blocked / rate limited / outage: retry later
            raise RuntimeError(f"Groq HTTP {e.code}: {e.read()[:200]!r}") from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            self._down_until = time.monotonic() + self.COOLDOWN_S
            raise RuntimeError(f"Groq unreachable: {e}") from e


class Listener:
    def __init__(self, model_name=config.STT_MODEL):
        self.local_name = model_name
        self.model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=config.STT_THREADS)
        self._lock = threading.Lock()
        self.groq = GroqWhisper(config.groq_key())
        self._local(np.zeros(16000, dtype=np.int16).tobytes())  # warm-up

    @property
    def name(self) -> str:
        return f"groq:{config.GROQ_MODEL} (fallback {self.local_name})" if self.groq.key else self.local_name

    def _local(self, pcm16: bytes) -> str:
        audio = np.frombuffer(pcm16, dtype=np.int16).astype(np.float32) / 32768.0
        with self._lock:
            segments, _ = self.model.transcribe(
                audio,
                language=config.STT_LANGUAGE,
                beam_size=1,                    # greedy: much faster, fine for short questions
                temperature=0.0,                # one pass; the default retries at higher temperatures are slow
                vad_filter=False,               # our own VAD already cut the turn
                condition_on_previous_text=False,
                without_timestamps=True,
                max_new_tokens=120,             # a question is short; stops runaway hallucination loops
                # no initial_prompt: the small local model starts repeating the prompt words
            )
            return " ".join(s.text.strip() for s in segments).strip()

    def transcribe(self, pcm16: bytes) -> dict:
        """16 kHz 16-bit mono PCM -> {"text", "engine", "stt_ms", "language"}."""
        t0 = time.perf_counter()
        engine, note = "local", None
        if self.groq.usable:
            try:
                text, engine = self.groq.transcribe(pcm16), "groq"
            except RuntimeError as e:
                note = str(e)
                text = self._local(pcm16)
        else:
            text = self._local(pcm16)
        out = {"text": text, "engine": engine,
               "language": "auto" if engine == "groq" else (config.STT_LANGUAGE or "auto"),
               "stt_ms": round((time.perf_counter() - t0) * 1000)}
        if note:
            out["fallback_reason"] = note[:200]
        return out
