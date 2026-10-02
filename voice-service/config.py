"""Settings for the voice service. Override any of them with environment variables."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent

HOST = os.environ.get("VOICE_HOST", "127.0.0.1")
PORT = int(os.environ.get("VOICE_PORT", "8765"))

# Sir Mahad's trained Piper voice (git-ignored, copy it into voice-service/models/).
VOICE_MODEL = Path(os.environ.get("VOICE_MODEL", ROOT / "models" / "ur_PK-sirmahad-medium.onnx"))

# Listening tests: the defaults stored in the voice's .onnx.json sounded best.
# Set these only to experiment (e.g. VOICE_SPEED=1.1 is slower).
VOICE_SPEED = float(os.environ["VOICE_SPEED"]) if "VOICE_SPEED" in os.environ else None
VOICE_NOISE = float(os.environ["VOICE_NOISE"]) if "VOICE_NOISE" in os.environ else None

# Speech-to-text (faster-whisper, CPU int8). Benchmark on the team laptop (i5-7300U):
# tiny = garbage, base = ~3-4 s per question and close, small = 9-25 s (too slow).
# Auto language detection produced Turkish/Punjabi/Hindi output, so Urdu is forced.
STT_MODEL = os.environ.get("STT_MODEL", "base")
STT_LANGUAGE = os.environ.get("STT_LANGUAGE", "ur") or None   # "" = auto-detect (not recommended)
STT_THREADS = int(os.environ.get("STT_THREADS", "4"))
# The teacher's brain: the Node app's lesson endpoint (Person 4's LLM).
CHAT_URL = os.environ.get("CHAT_URL", "http://127.0.0.1:4317/api/chat")
CHAT_TIMEOUT_S = float(os.environ.get("CHAT_TIMEOUT_S", "120"))   # a local LLM on a laptop can be slow
CHAT_MOCK = os.environ.get("CHAT_MOCK", "") not in ("", "0", "false")  # canned answer, to test without an LLM

# Interrupting Sir mid-answer by just talking. Turn off if speaker echo keeps stopping him (no headphones).
BARGE_IN = os.environ.get("BARGE_IN", "1") not in ("0", "false", "")
BARGE_IN_ARM_S = float(os.environ.get("BARGE_IN_ARM_S", "0.6"))
# A student talking into the laptop mic is far louder than Sir's voice leaking back from the speakers.
# Raise (e.g. -26) if speaker echo still interrupts him; lower (e.g. -38) if the student can't cut in.
BARGE_IN_MIN_DB = float(os.environ.get("BARGE_IN_MIN_DB", "-32"))

# Groq Whisper (free account, online). Key from GROQ_API_KEY or runtime/groq-key.txt (git-ignored).
GROQ_MODEL = os.environ.get("GROQ_MODEL", "whisper-large-v3")   # best Groq model for Urdu
GROQ_TIMEOUT_S = float(os.environ.get("GROQ_TIMEOUT_S", "8"))
GROQ_KEY_FILE = ROOT.parent / "runtime" / "groq-key.txt"


def groq_key() -> str:
    if os.environ.get("GROQ_API_KEY"):
        return os.environ["GROQ_API_KEY"].strip()
    try:
        return GROQ_KEY_FILE.read_text(encoding="utf-8-sig").strip()
    except OSError:
        return ""


# Physics words help Whisper spell the student's English terms correctly.
STT_PROMPT = os.environ.get(
    "STT_PROMPT", "Sir, physics question: diffraction, wavelength, waves, gap, refraction, reflection, speed.")
