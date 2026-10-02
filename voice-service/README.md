# Voice service (Person 2)

Sir Mahad's cloned voice, free and offline, real-time on a laptop CPU.

## Setup

```sh
pip install -r voice-service/requirements.txt
```

Copy the trained voice (not in Git, ~63 MB) into `voice-service/models/`:

- `ur_PK-sirmahad-medium.onnx`
- `ur_PK-sirmahad-medium.onnx.json`

For good Urdu speech recognition, create a free key at [console.groq.com](https://console.groq.com)
and put it alone in `runtime/groq-key.txt` (git-ignored; never commit it). Without a key, or without
internet, the service falls back to local faster-whisper `base` (works offline, weaker Urdu).

## Run

`start.cmd` starts it automatically. Or by hand:

```sh
python voice-service/server.py     # http://127.0.0.1:8765
```

The Node app's `/api/tts` uses it automatically and falls back to eSpeak NG if it is not running.
`/api/config` reports `tts: "Sir Mahad cloned voice"` when it is connected.

## API

| Endpoint | Use |
|---|---|
| `GET /health` | `{"ok": true, "voice": "...", "sample_rate": 22050}` |
| `POST /tts {"text"}` | whole answer as `audio/wav` |
| `WS /ws/tts` | streaming, one sentence at a time; `{"type":"speak","id","text"}` / `{"type":"stop"}` |
| `WS /ws/listen` | send 16 kHz 16-bit mic PCM; get `vad` start/stop events and a `transcript` per question |
| `WS /ws/call` | the whole call: mic in -> `state`, `transcript`, `lesson` (the `/api/chat` JSON with board) -> Sir's voice streamed -> listening again. Protocol in `server.py` |

## The call (`call.py`, browser `public/call/`)

Press **Call Sir** in the app. `listening -> thinking -> speaking -> listening`, no buttons:
the student talks, Groq transcribes, the voice service posts the question to the Node app's `/api/chat`
(Person 4's LLM), sends the lesson to the page (blackboard, answer panel) and streams `speech_text` +
`check.speech` in Sir's voice. The page tells the service when the speakers finish (`played`) so it
doesn't start listening while Sir is still audible.

**Interrupting (barge-in):** while Sir speaks, the student can just start talking. Sir stops at once
(`interrupted` event, the page drops queued audio) and the student's question, including the words
that triggered the interruption, becomes the next turn. Speaker echo is rejected by browser echo
cancellation plus a stricter detector: speech-likeness 0.75, at least 320 ms, louder than
`BARGE_IN_MIN_DB` (default -32 dBFS), armed 0.6 s after Sir starts. Tune with `BARGE_IN_MIN_DB`
(raise if Sir stops by himself, lower if students can't cut in) or turn it off with `BARGE_IN=0`.

Without a working LLM, run the service with a canned answer to test the call:

```sh
set CHAT_MOCK=1 && python voice-service/server.py
```

The browser console logs per-turn latency: `[call] stt … llm … first audio … ms after you stopped`.

Try listening hands-free at `http://127.0.0.1:4317/call/listen-test.html` (Chrome, allow the mic).

Measured on the team laptop (i5-7300U): first spoken sentence ready in ~0.26 s (~6x faster than real
time); a question is transcribed ~1 s after the student stops talking (Groq).

## How listening works

- `vad.py`: Silero VAD (pysilero-vad, no torch) on 32 ms frames. A question starts after 160 ms of speech
  and ends after 600 ms of silence (max 20 s), with 320 ms of pre-roll so the first syllable is kept.
- `stt.py`: Groq `whisper-large-v3`. Auto-detect and forced-Urdu are requested in parallel and the more
  confident one wins (auto-detect alone mislabels mixed Urdu; forced Urdu garbles all-English questions).
  Local `base` (forced Urdu, greedy, no prompt) is the offline fallback; after a network error Groq is
  skipped for 60 s so questions don't wait on timeouts.

## What text sounds good (for the LLM `speech_text`)

- Urdu in **Urdu script**, English terms in **Latin letters** (`<en>…</en>` tags are fine, they are stripped).
- **No Roman Urdu** ("dekho beta" is read with English rules and sounds wrong).
- No symbols (`≈ λ = ²`), markdown, emoji; units and numbers in words. Formulas go on the board, not in speech.
- 2–4 sentences of 8–20 words; `۔ ؟ !` and `،` for natural pauses.

`text_norm.py` cleans common mistakes anyway: strips `<en>` tags, rewrites every greeting spelling to
`اَس سلام و علیکم` (the one that sounds right), and turns symbols into words.

## Tests

```sh
python -m pytest voice-service/tests
```
