import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from call import CallSession


class FakeWs:
    def __init__(self):
        self.sent = []

    async def send_json(self, obj):
        self.sent.append(obj)

    async def send_bytes(self, data):
        self.sent.append(data)

    def types(self):
        return [m.get("type") if isinstance(m, dict) else "pcm" for m in self.sent]


class FakeVoice:
    """One silent 'sentence' per call to stream(), slow enough to be interrupted."""
    sample_rate = 22050

    def __init__(self, sentences=3, delay=0.05):
        self.sentences, self.delay = sentences, delay

    def stream(self, text):
        for i in range(self.sentences):
            time.sleep(self.delay)
            yield i, b"\0\0" * 2205  # 0.1 s


async def _until(cond, timeout=3.0):
    t = time.perf_counter()
    while not cond():
        assert time.perf_counter() - t < timeout, "timed out"
        await asyncio.sleep(0.01)


def test_say_speaks_then_listens_again():
    async def run():
        ws = FakeWs()
        s = CallSession(ws, FakeVoice(), listener=None)
        await s.on_say("دیکھو بیٹا")
        await _until(lambda: "audio_end" in ws.types())
        await s.on_played()
        await s.turn_task
        assert {"type": "state", "value": "speaking"} in ws.sent
        assert ws.types().count("pcm") == 3
        assert s.state == "listening"
        assert next(m for m in ws.sent if isinstance(m, dict) and m["type"] == "metrics")["say"] is True
    asyncio.run(run())


def test_say_can_be_interrupted_by_the_student():
    async def run():
        ws = FakeWs()
        s = CallSession(ws, FakeVoice(sentences=20), listener=None)
        await s.on_say("ایک لمبی بات")
        await _until(lambda: s.state == "speaking")
        await s._interrupt()  # what the barge-in detector does when the student talks over Sir
        await s.turn_task
        assert "interrupted" in ws.types()
        assert ws.types().count("pcm") < 20
        assert next(m for m in ws.sent if isinstance(m, dict) and m["type"] == "audio_end")["stopped"]
        assert s.state == "listening"
    asyncio.run(run())


def test_new_say_replaces_one_still_playing():
    async def run():
        ws = FakeWs()
        s = CallSession(ws, FakeVoice(sentences=20), listener=None)
        await s.on_say("پہلی بات")
        await _until(lambda: s.state == "speaking")
        await s.on_say("دوسری بات")
        await _until(lambda: ws.types().count("audio_end") == 2)
        ends = [m for m in ws.sent if isinstance(m, dict) and m["type"] == "audio_end"]
        assert ends[0]["stopped"] and ends[0]["id"] != ends[1]["id"]
        await s.on_stop()
        await s.turn_task
    asyncio.run(run())


def test_say_is_ignored_while_answering_a_spoken_question():
    async def run():
        ws = FakeWs()
        s = CallSession(ws, FakeVoice(), listener=None)
        s.state = "thinking"
        await s.on_say("ignored")
        assert s.turn_task is None
    asyncio.run(run())
