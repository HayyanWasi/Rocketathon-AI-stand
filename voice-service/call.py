"""
One phone-call-like conversation with Sir Mahad over a single WebSocket.

    listening --(student stops talking)--> thinking --(answer ready)--> speaking --(done)--> listening

thinking = speech-to-text, then the Node app's /api/chat (Person 4's LLM, lesson JSON with board).
speaking = Sir's cloned voice streamed one sentence at a time.
"""
import asyncio
import json
import threading
import time
import urllib.error
import urllib.request

import config
from vad import TurnConfig, TurnDetector

# While Sir is speaking, his own voice can leak from the speakers into the mic (browser echo
# cancellation removes most of it). So interrupting him needs louder, longer speech than a normal turn.
BARGE_IN_CFG = TurnConfig(speech_threshold=0.75, start_ms=320, preroll_ms=800,
                          min_rms_db=config.BARGE_IN_MIN_DB)


# ---------------------------------------------------------------- the teacher's brain (Node app)

MOCK_LESSONS = [
    {
        "status": "answer",
        "answer": "Beta, diffraction mein waves kisi gap ya rukawat ke kinare se mud kar phail jaati hain.",
        "speech_text": "دیکھو بیٹا، <en>diffraction</en> میں <en>waves</en> کسی <en>gap</en> کے کنارے سے مڑ کر پھیل جاتی ہیں۔ "
                       "جتنا <en>gap</en> چھوٹا ہوگا، اتنی زیادہ پھیلیں گی۔",
        "citations": [],
        "check": {"question": "Gap bara karein to kya hoga?", "solution": "Spreading kam ho jayegi.",
                  "speech": "اچھا اب بتاؤ، اگر <en>gap</en> بڑا کر دیں تو کیا ہوگا؟"},
        "board": {"title": "Diffraction", "steps": ["Waves gap se guzarti hain", "Kinaron se mud kar phailti hain",
                                                     "Chhota gap = zyada phailao"],
                  "equation": "", "diagram": []},
        "provider": "mock",
    },
]


def ask_teacher(question: str) -> dict:
    """Blocking call to the Node app's /api/chat (run it in a thread)."""
    if config.CHAT_MOCK:
        time.sleep(0.4)  # pretend to think
        return dict(MOCK_LESSONS[0], answer=MOCK_LESSONS[0]["answer"] + f" (mock reply to: {question})")
    req = urllib.request.Request(
        config.CHAT_URL, data=json.dumps({"question": question}).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=config.CHAT_TIMEOUT_S) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("error")
        except ValueError:
            msg = None
        raise RuntimeError(msg or f"Teacher app error {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError(f"Teacher app unreachable at {config.CHAT_URL}: {e}") from e


def spoken_text(lesson: dict) -> str:
    """What Sir says: the explanation, then the check-for-understanding question."""
    parts = [lesson.get("speech_text") or lesson.get("answer") or ""]
    check = lesson.get("check") or {}
    if check.get("speech"):
        parts.append(check["speech"])
    return " ".join(p.strip() for p in parts if p and p.strip())


# ---------------------------------------------------------------- streaming Sir's voice

def _synthesize_into(voice, queue: asyncio.Queue, loop, text: str, stop: threading.Event):
    """Worker thread: push each sentence's PCM as soon as it is ready; stop between sentences."""
    try:
        for index, pcm in voice.stream(text):
            if stop.is_set():
                break
            loop.call_soon_threadsafe(queue.put_nowait, (index, pcm))
    finally:
        loop.call_soon_threadsafe(queue.put_nowait, None)


async def speak_to_ws(ws, voice, msg_id: str, text: str, stop: threading.Event, on_first_audio=None) -> dict:
    """Stream `text` in Sir's voice: audio_start, (chunk JSON + binary PCM) per sentence, audio_end."""
    loop = asyncio.get_running_loop()
    t0, first, sent_bytes = time.perf_counter(), None, 0
    queue: asyncio.Queue = asyncio.Queue()
    await ws.send_json({"type": "audio_start", "id": msg_id, "sample_rate": voice.sample_rate})
    threading.Thread(target=_synthesize_into, args=(voice, queue, loop, text, stop), daemon=True).start()
    while (item := await queue.get()) is not None:
        if stop.is_set():
            continue  # drain until the worker finishes its current sentence
        index, pcm = item
        if first is None:
            first = time.perf_counter() - t0
            if on_first_audio:
                on_first_audio()
        await ws.send_json({"type": "chunk", "id": msg_id, "index": index, "bytes": len(pcm)})
        await ws.send_bytes(pcm)
        sent_bytes += len(pcm)
    end = {"type": "audio_end", "id": msg_id, "stopped": stop.is_set(),
           "first_audio_ms": round((first or 0) * 1000), "total_ms": round((time.perf_counter() - t0) * 1000),
           "audio_s": round(sent_bytes / 2 / voice.sample_rate, 2)}
    await ws.send_json(end)
    return end


# ---------------------------------------------------------------- one call

class CallSession:
    def __init__(self, ws, voice, listener):
        self.ws, self.voice, self.listener = ws, voice, listener
        self.det = TurnDetector()
        self.barge_det = TurnDetector(BARGE_IN_CFG)
        self.barge_ignore_until = 0.0
        self.interrupted = False
        self.state = "listening"
        self.turn_task: asyncio.Task | None = None
        self.stop_speaking = threading.Event()
        self.played = asyncio.Event()   # set when the browser has finished playing Sir's answer
        self.turns = 0

    async def set_state(self, value: str):
        self.state = value
        await self.ws.send_json({"type": "state", "value": value})

    async def on_audio(self, pcm: bytes):
        if self.state == "speaking":
            await self._listen_for_barge_in(pcm)
            return
        if self.state != "listening":
            return  # thinking: the question is already being answered
        for ev in self.det.feed(pcm):
            if ev.kind == "start":
                await self.ws.send_json({"type": "vad", "speaking": True})
            else:
                await self.ws.send_json({"type": "vad", "speaking": False, "duration_s": round(ev.duration_s, 2)})
                self._start_turn(self._spoken_turn(ev.audio, time.perf_counter()))
                break

    async def _listen_for_barge_in(self, pcm: bytes):
        """The student starts talking over Sir: Sir stops at once and listens, like on a real call."""
        if not config.BARGE_IN or time.perf_counter() < self.barge_ignore_until:
            return
        for ev in self.barge_det.feed(pcm):
            if ev.kind == "start":
                await self._interrupt()
                return

    async def _interrupt(self):
        self.interrupted = True
        self.stop_speaking.set()
        self.played.set()
        await self.ws.send_json({"type": "interrupted"})
        # The barge-in detector already holds the student's first words (pre-roll included):
        # it becomes the normal turn detector, so the rest of the question continues seamlessly.
        self.det, self.barge_det = self.barge_det, TurnDetector(BARGE_IN_CFG)
        # Sir is silent now: hear the rest of the question normally (the loudness gate would turn the
        # student's softer syllables into "silence" and end the question halfway)
        self.det.cfg = TurnConfig()
        await self.set_state("listening")
        await self.ws.send_json({"type": "vad", "speaking": True})

    async def on_text(self, question: str):
        """A typed question goes through the same answer path."""
        if self.state == "listening" and question.strip():
            self._start_turn(self._answer(question.strip(), time.perf_counter(), {}))

    async def on_say(self, text: str):
        """Speak text the app already has (a typed question's lesson, "Read aloud") with barge-in armed,
        so the student can cut in exactly as on a spoken turn. A newer say replaces one still playing."""
        text = text.strip()
        if not text or self.state == "thinking":
            return
        if self.state == "speaking" and self.turn_task and not self.turn_task.done():
            await self.on_stop()
            await asyncio.gather(self.turn_task, return_exceptions=True)
        if self.state == "listening":
            self._start_turn(self._say(text))

    async def _say(self, text: str):
        self.turns += 1
        metrics = {"say": True}
        await self._speak(text, metrics, time.perf_counter())
        await self.ws.send_json({"type": "metrics", **metrics})
        await self._back_to_listening()

    async def on_stop(self):
        self.stop_speaking.set()
        self.played.set()

    async def on_played(self):
        """The browser's speaker queue ran empty: Sir has really finished talking."""
        self.played.set()

    async def _wait_until_played(self, end: dict, speech_started: float):
        # Audio is made ~6x faster than real time, so the server finishes long before the speakers do.
        # Wait for the browser's "played" message; if it never comes, wait for the audio's own length.
        deadline = speech_started + end["audio_s"] + 1.0
        try:
            await asyncio.wait_for(self.played.wait(), timeout=max(0.1, deadline - time.perf_counter()))
        except asyncio.TimeoutError:
            pass

    def _start_turn(self, coro):
        self.turn_task = asyncio.create_task(coro)

    async def _spoken_turn(self, audio: bytes, t_end: float):
        await self.set_state("thinking")
        heard = await asyncio.to_thread(self.listener.transcribe, audio)
        await self.ws.send_json({"type": "transcript", **heard})
        if not heard["text"]:
            await self._back_to_listening()
            return
        await self._answer(heard["text"], t_end, {"stt_ms": heard["stt_ms"], "stt_engine": heard["engine"]})

    async def _answer(self, question: str, t_end: float, metrics: dict):
        self.turns += 1
        if self.state != "thinking":
            await self.set_state("thinking")
        try:
            t0 = time.perf_counter()
            lesson = await asyncio.to_thread(ask_teacher, question)
            metrics["llm_ms"] = round((time.perf_counter() - t0) * 1000)
        except RuntimeError as e:
            await self.ws.send_json({"type": "error", "message": str(e)})
            await self._back_to_listening()
            return
        await self.ws.send_json({"type": "lesson", "question": question, "lesson": lesson})

        text = spoken_text(lesson)
        if text:
            await self._speak(text, metrics, t_end)
        await self.ws.send_json({"type": "metrics", **metrics})
        await self._back_to_listening()

    async def _speak(self, text: str, metrics: dict, t_end: float):
        """Sir talks; the student can cut in at any moment (see _listen_for_barge_in)."""
        self.stop_speaking = threading.Event()

        def first_audio():
            metrics["first_audio_ms"] = round((time.perf_counter() - t_end) * 1000)

        self.played = asyncio.Event()
        self.barge_det.reset()
        # the first moments of playback are the most likely to echo before the browser's echo
        # canceller has adapted, so barge-in only arms after a short delay
        self.barge_ignore_until = time.perf_counter() + config.BARGE_IN_ARM_S
        await self.set_state("speaking")
        speech_started = time.perf_counter()
        end = await speak_to_ws(self.ws, self.voice, f"t{self.turns}", text, self.stop_speaking, first_audio)
        if not end["stopped"]:
            await self._wait_until_played(end, speech_started)
        metrics["stopped"] = end["stopped"] or self.stop_speaking.is_set()

    async def _back_to_listening(self):
        if self.interrupted:
            # already listening to the student who cut in; resetting now would lose their words
            self.interrupted = False
            return
        self.det.reset()  # forget anything heard while Sir was talking
        await self.set_state("listening")

    async def close(self):
        self.stop_speaking.set()
        if self.turn_task and not self.turn_task.done():
            self.turn_task.cancel()
