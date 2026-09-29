# Sir Mahad’s Physics Stand-In

A local web interface with an ElevenLabs teaching agent, timestamped lecture evidence, generated blackboard, microphone transcription, and spoken answers. **This is an AI representation, not Sir Mahad speaking live.** The persona is a project draft until his approval is recorded.

## Run

Requires Node.js 22+ and Python 3.10+.

```sh
npm ci
python -m pip install -r requirements-elevenlabs.txt
```

Set `ELEVENLABS_API_KEY` in the server environment, or put the key alone in `runtime/elevenlabs-key.txt` (ignored by Git). The key already supplied in this chat has been placed in that local ignored file. If Python is not on PATH, set `ELEVENLABS_PYTHON` to its executable, or put the executable path in `runtime/python-path.txt`.

```sh
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The configured ElevenLabs agent and demo voice IDs are in `backend/agent.json`. Agent creation was completed on the supplied account. **The API key is never sent to the browser or committed.** ElevenLabs usage may consume account credits.

The current voice is a stock demo voice, not Sir Mahad’s voice clone. When his approved audio arrives, replace the voice ID after confirming the voice is available in the account. The portrait is generated low-poly art animated as a 2.5D mesh.

## How a lesson loads

1. `backend/persona.md` supplies the standing AI identity and teaching rules.
2. `backend/syllabus/index.json` is a small topic directory. The backend chooses a topic before loading its passage file. The first topic is diffraction from the verified [Physics with MAC revision lecture](https://www.youtube.com/watch?v=H5ygtkokVsI&t=26340s).
3. `runtime/students/<student-id>.json` supplies only the active browser’s recent history. Each student has a separate file. The browser ID is a convenience identifier, **not authentication**; use real sign-in before hosting this for multiple people.
4. Only the highest ranked timestamped passages, recent history, and approved notes are sent to the agent. The server validates returned passage IDs, adds the links, and bounds diagram data.

No physics answers or diagrams are prewritten. If the evidence is insufficient, conflicting, outside the topic, or requires the teacher’s personal judgement, the app refers the question to him. Generated explanations still need human review for factual accuracy.

The backend uses local files for the hackathon. A later authenticated deployment can replace `backend/students.mjs` with Supabase while keeping the lesson interface.

## Voice

The microphone records WAV in the browser, sends it to the local server, then ElevenLabs Scribe transcribes it. The student checks the text before sending. ElevenLabs TTS generates MP3 for an answer and its check question; the avatar moves with audio energy. New questions and the stop control interrupt playback.

Live teaching, TTS, and Scribe transcription were tested against the supplied ElevenLabs account. Browser microphone permission and live human audio still need a final check on the target machine.

## Verification and Git

```sh
npm test
```

The repository excludes `runtime/`, including the key and student files, plus node modules and downloaded assets. It is initialized with `origin` set to [Rocketathon-AI-stand](https://github.com/HayyanWasi/Rocketathon-AI-stand). Commit and push from this folder when ready. If the remote already contains commits, fetch and reconcile them first.

The persona is user supplied and awaiting Sir Mahad’s recorded approval. The source passages were corrected from the lecture’s Hindi auto-captions; they are Roman Urdu paraphrases, not verbatim teacher quotes. Only record approved notes with an actual approval reference.
