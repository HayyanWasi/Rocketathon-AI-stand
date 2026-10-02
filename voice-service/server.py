"""
Voice service: Sir Mahad's cloned voice over HTTP and WebSocket.

  python server.py            # http://127.0.0.1:8765

  GET  /health                -> {"ok": true, "voice": ..., "sample_rate": 22050}
  POST /tts   {"text": ...}   -> audio/wav (whole answer; used by the Node app's /api/tts)
  WS   /ws/tts                -> streaming, one sentence at a time:
        client: {"type": "speak", "id": "a1", "text": "..."}   |   {"type": "stop"}
        server: {"type": "audio_start", "id", "sample_rate"}, then per sentence
                {"type": "chunk", "id", "index", "bytes"} + <binary 16-bit PCM>,
                then {"type": "audio_end", "id", "stopped": bool, "first_audio_ms", "total_ms"}
  WS   /ws/listen             -> hands-free listening:
        client: <binary 16 kHz 16-bit mono PCM, any frame size>  |  {"type": "reset"}
        server: {"type": "vad", "speaking": true}   when the student starts talking
                {"type": "vad", "speaking": false, "duration_s"}   when they stop
                {"type": "transcript", "text", "language", "stt_ms", "duration_s"}
  WS   /ws/call               -> the whole call (listen -> transcribe -> /api/chat -> speak -> listen):
        client: <binary mic PCM> | {"type": "text", "text"} (typed question) | {"type": "say", "text"} (speak this, interruptible)
                | {"type": "stop"} (stop talking)
                | {"type": "played"} (speaker queue empty: Sir has finished, start listening again)
        server: {"type": "state", "value": "listening"|"thinking"|"speaking"}, vad, transcript,
                {"type": "lesson", "question", "lesson": <the /api/chat JSON, incl. board>},
                audio_start / chunk + PCM / audio_end (as /ws/tts), {"type": "metrics", ...}, {"type": "error"}
"""
import asyncio
import json
import threading
import time
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel

import config
from call import CallSession, speak_to_ws
from stt import Listener
from tts import TeacherVoice
from vad import TurnDetector

voice: TeacherVoice | None = None
listener: Listener | None = None
MAX_TEXT = 2000


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global voice, listener
    t0 = time.perf_counter()
    voice, listener = await asyncio.gather(asyncio.to_thread(TeacherVoice), asyncio.to_thread(Listener))
    print(f"voice '{voice.name}' + whisper '{listener.name}' ready in {time.perf_counter() - t0:.1f}s "
          f"on http://{config.HOST}:{config.PORT}")
    yield


app = FastAPI(title="Sir Mahad voice service", lifespan=lifespan)


class SpeakRequest(BaseModel):
    text: str


@app.get("/health")
def health():
    return {"ok": voice is not None, "voice": voice.name if voice else None,
            "sample_rate": voice.sample_rate if voice else None,
            "stt": listener.name if listener else None}


@app.post("/tts")
async def tts(req: SpeakRequest):
    text = req.text.strip()
    if not text or len(text) > MAX_TEXT:
        raise HTTPException(400, f"text must be 1-{MAX_TEXT} characters")
    wav = await asyncio.to_thread(voice.wav, text)
    return Response(wav, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@app.websocket("/ws/tts")
async def ws_tts(ws: WebSocket):
    await ws.accept()
    current: dict = {}  # {"stop": Event, "task": Task}

    def stop_current():
        if current:
            current["stop"].set()

    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "stop":
                stop_current()
            elif msg.get("type") == "speak":
                text = str(msg.get("text", "")).strip()[:MAX_TEXT]
                if not text:
                    continue
                stop_current()  # a new answer interrupts the old one
                if current.get("task"):
                    await current["task"]
                stop = threading.Event()
                current.update(stop=stop, task=asyncio.create_task(
                    speak_to_ws(ws, voice, str(msg.get("id", "")), text, stop)))
    except WebSocketDisconnect:
        stop_current()


@app.websocket("/ws/listen")
async def ws_listen(ws: WebSocket):
    await ws.accept()
    det = TurnDetector()
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("text"):
                if '"reset"' in msg["text"]:
                    det.reset()
                continue
            for ev in det.feed(msg.get("bytes") or b""):
                if ev.kind == "start":
                    await ws.send_json({"type": "vad", "speaking": True})
                    continue
                await ws.send_json({"type": "vad", "speaking": False, "duration_s": round(ev.duration_s, 2)})
                result = await asyncio.to_thread(listener.transcribe, ev.audio)
                if result["text"]:
                    await ws.send_json({"type": "transcript", "duration_s": round(ev.duration_s, 2), **result})
    except WebSocketDisconnect:
        pass


@app.websocket("/ws/call")
async def ws_call(ws: WebSocket):
    """The full hands-free call. See call.py for the flow and README.md for the protocol."""
    await ws.accept()
    session = CallSession(ws, voice, listener)
    await session.set_state("listening")
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes"):
                await session.on_audio(msg["bytes"])
                continue
            try:
                cmd = json.loads(msg.get("text") or "{}")
            except ValueError:
                continue
            if cmd.get("type") == "text":
                await session.on_text(str(cmd.get("text", ""))[:1200])
            elif cmd.get("type") == "say":
                await session.on_say(str(cmd.get("text", ""))[:MAX_TEXT])
            elif cmd.get("type") == "stop":
                await session.on_stop()
            elif cmd.get("type") == "played":
                await session.on_played()
    except WebSocketDisconnect:
        pass
    finally:
        await session.close()


if __name__ == "__main__":
    uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="warning")
