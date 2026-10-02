"""
Clean LLM `speech_text` into what the cloned voice pronounces well.

The voice was trained on Urdu script with English words in Latin letters (espeak `ur`
switches to English phonemes for Latin words). Listening tests showed:
  - Roman Urdu sounds bad, Urdu script sounds good -> nothing to do here, that is the LLM's job.
  - "السلام علیکم" in any spelling sounds bad; "اَس سلام و علیکم" sounds good.
  - Symbols / markdown get read out literally ("lambda", "approximately", "asterisk").
"""
import re

GREETING = "اَس سلام و علیکم"

# zabar/zer/pesh/shadd etc. The training transcripts had none, and they break matching.
_DIACRITICS_RE = re.compile("[ً-ْٰ]")

_GREETING_PATTERNS = [
    # Urdu script (diacritics already removed): السلام علیکم, السلام و علیکم, اسلام علیکم
    r"ال?سلام\s*(?:و\s*)?علیکم",
    # Latin variants: assalam o alaikum, asalamualaikum, salam alaikum ...
    r"\ba?s+a?l+a+m+[\s\-]*(?:[uo][\s\-]*)?al[ae]i?ku+m\b",
    r"\bAOA\b",
]
_GREETING_RE = re.compile("|".join(_GREETING_PATTERNS), re.IGNORECASE)

# Read-aloud forms for symbols the LLM sometimes leaves in speech text.
_SYMBOLS = {
    "≈": " تقریباً ",
    "=": " برابر ہے ",
    "+": " plus ",
    "×": " into ",
    "÷": " divided by ",
    "→": " ، ",
    "λ": " lambda ",
    "θ": " theta ",
    "Δ": " delta ",
    "°": " degree ",
    "%": " percent ",
    "²": " square ",
    "³": " cube ",
}

_EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF️]")
_MARKDOWN_RE = re.compile(r"[*_#`~>|\[\]{}]")
_BULLET_RE = re.compile(r"(?m)^\s*(?:[-•]|\d+[.)])\s+")
_SPACE_RE = re.compile(r"\s+")


def normalize(text: str) -> str:
    """LLM speech_text -> text for the TTS."""
    if not text:
        return ""
    t = re.sub(r"</?en>", "", text, flags=re.IGNORECASE)  # <en>term</en> -> term (Latin = English phonemes)
    t = _DIACRITICS_RE.sub("", t)
    t = _GREETING_RE.sub(GREETING, t)
    t = _BULLET_RE.sub("", t)
    t = _MARKDOWN_RE.sub(" ", t)
    t = _EMOJI_RE.sub("", t)
    for sym, spoken in _SYMBOLS.items():
        t = t.replace(sym, spoken)
    t = t.replace("\n", "۔ ")
    t = _SPACE_RE.sub(" ", t).strip()
    t = re.sub(r"\s+([،۔,.?!؟])", r"\1", t)  # no space before punctuation
    t = re.sub(r"([۔.])\1+", r"\1", t)      # collapse repeated full stops from newline joins
    return t
