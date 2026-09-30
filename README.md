# Sir Mahad’s Physics Stand-In

A fully offline web interface with a local teaching agent, timestamped lecture evidence, generated blackboard, microphone transcription, and spoken answers. **This is an AI representation, not Sir Mahad speaking live.** The persona is a project draft until his approval is recorded.

## Run

Requires Node.js 22+, Python 3.10+, Ollama, and espeak-ng.

```sh
npm ci
pip install -r requirements.txt
ollama pull qwen2.5:3b # Or whichever model you use
```

```sh
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). 

The current voice is generated via eSpeak NG offline. The portrait is generated low-poly art animated as a 2.5D mesh.

## How a lesson loads

1. `backend/persona.md` supplies the standing AI identity and teaching rules.
2. `backend/syllabus/index.json` is a small topic directory. The backend chooses a topic before loading its passage file.
3. `runtime/students/student.json` supplies the single user's history. 
4. Only the highest ranked timestamped passages, recent history, and approved notes are sent to the local agent. The server validates returned passage IDs, adds the links, and bounds diagram data.

No physics answers or diagrams are prewritten. If the evidence is insufficient, conflicting, outside the topic, or requires the teacher’s personal judgement, the app refers the question to him. Generated explanations still need human review for factual accuracy.

## Voice

The microphone records WAV in the browser, sends it to the local server, then faster-whisper transcribes it. The student checks the text before sending. Local TTS generates WAV for an answer and its check question; the avatar moves with audio energy. New questions and the stop control interrupt playback.

## Verification and Git

```sh
npm test
```

The repository excludes `runtime/` and node modules. Commit and push from this folder when ready.
