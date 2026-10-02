import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import stt


class FakeGroq:
    def __init__(self, result=None, error=None, usable=True):
        self.result, self.error, self.usable, self.key = result, error, usable, "k" if usable else ""
        self.calls = 0

    def transcribe(self, pcm16):
        self.calls += 1
        if self.error:
            raise RuntimeError(self.error)
        return self.result


def make_listener(groq) -> stt.Listener:
    """A Listener without loading Whisper: the local engine is stubbed."""
    lst = object.__new__(stt.Listener)
    lst._lock, lst.local_name, lst.groq = threading.Lock(), "base", groq
    lst._local = lambda pcm16: "local text"
    return lst


def test_groq_is_used_when_available():
    out = make_listener(FakeGroq(result="سر، diffraction کیا ہوتا ہے؟")).transcribe(b"\0\0" * 1600)
    assert out["engine"] == "groq" and out["text"] == "سر، diffraction کیا ہوتا ہے؟"


def test_falls_back_to_local_when_groq_fails():
    out = make_listener(FakeGroq(error="Groq unreachable: no internet")).transcribe(b"\0\0" * 1600)
    assert out["engine"] == "local" and out["text"] == "local text"
    assert "unreachable" in out["fallback_reason"]


def test_no_key_goes_straight_to_local():
    groq = FakeGroq(result="x", usable=False)
    out = make_listener(groq).transcribe(b"\0\0" * 1600)
    assert out["engine"] == "local" and groq.calls == 0


def groq_with(answers):
    """answers: {language: (text, confidence) or Exception}"""
    g = stt.GroqWhisper("key")

    def fake_request(pcm16, language):
        a = answers[language]
        if isinstance(a, Exception):
            raise a
        return a

    g._request = fake_request
    return g


def test_hindi_script_loses_even_if_confident():
    g = groq_with({None: ("सर डिफ्रेक्शन क्या होता है", -0.1, "hi"), "ur": ("سر، diffraction کیا ہوتا ہے؟", -0.4, "ur")})
    assert g.transcribe(b"\0\0") == "سر، diffraction کیا ہوتا ہے؟"


def test_other_languages_lose_even_if_confident():
    g = groq_with({None: ("Sadece diffraction geldi.", -0.1, "tu"), "ur": ("سر، diffraction کیا ہوتا ہے؟", -0.6, "ur")})
    assert g.transcribe(b"\0\0") == "سر، diffraction کیا ہوتا ہے؟"


def test_more_confident_version_wins():
    english = groq_with({None: ("What is refraction?", -0.2, "en"), "ur": ("دفتر کیا ہے؟", -1.3, "ur")})
    assert english.transcribe(b"\0\0") == "What is refraction?"
    mixed = groq_with({None: ("So the diffraction, you know", -0.9, "en"),
                       "ur": ("سر، diffraction کیا ہوتا ہے؟", -0.3, "ur")})
    assert mixed.transcribe(b"\0\0") == "سر، diffraction کیا ہوتا ہے؟"


def test_one_request_failing_still_gives_the_other():
    g = groq_with({None: RuntimeError("Groq HTTP 500"), "ur": ("سر، gap کیا ہے؟", -0.5, "ur")})
    assert g.transcribe(b"\0\0") == "سر، gap کیا ہے؟"


def test_network_failure_starts_cooldown(monkeypatch):
    g = stt.GroqWhisper("key")

    def no_network(*a, **k):
        raise stt.urllib.error.URLError("offline")

    monkeypatch.setattr(stt.urllib.request, "urlopen", no_network)
    try:
        g.transcribe(b"\0\0" * 1600)
    except RuntimeError:
        pass
    assert not g.usable  # skips Groq for COOLDOWN_S instead of timing out on every question
