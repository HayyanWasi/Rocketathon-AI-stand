import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from text_norm import GREETING, normalize


def test_en_tags_are_removed_but_words_kept():
    assert normalize("دیکھو بیٹا، <en>diffraction</en> میں") == "دیکھو بیٹا، diffraction میں"


def test_every_greeting_spelling_becomes_the_good_one():
    for g in ["السلام علیکم", "السلام و علیکم", "اَلسَّلامُ عَلَیکُم", "اسلام علیکم",
              "Assalam o Alaikum", "assalamualaikum", "Asalam-o-alaikum", "AOA"]:
        assert normalize(f"{g} بچو!") == f"{GREETING} بچو!", g


def test_reply_greeting_is_left_alone():
    assert normalize("وعلیکم السلام بیٹا") == "وعلیکم السلام بیٹا"


def test_symbols_are_spoken_not_spelled():
    out = normalize("λ ≈ d")
    assert "λ" not in out and "≈" not in out and "lambda" in out and "تقریباً" in out


def test_markdown_bullets_and_emoji_are_dropped():
    out = normalize("**Shabash!** 🎉\n- پہلا نکتہ\n- دوسرا نکتہ")
    assert "*" not in out and "🎉" not in out and "-" not in out
    assert "پہلا نکتہ" in out and "دوسرا نکتہ" in out


def test_empty_input():
    assert normalize("") == "" and normalize("   ") == ""
