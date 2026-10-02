# Components

## Current integration

| Component | Current role |
|---|---|
| Ollama | Teammate backend generates structured lesson JSON via its native `/api/chat` API. `OLLAMA_HOST` and `OLLAMA_MODEL` configure it. An OpenAI-compatible `/v1` URL is not interchangeable with this endpoint. |
| eSpeak NG | Local mixed Urdu/English WAV synthesis, using `speech_text` and `<en>` language tags. |
| Installed browser voice | Fallback when server TTS is unavailable. Only voices marked `localService` are selected. The device reads the Roman Urdu display explanation. |
| faster-whisper | Local transcription of the browser’s 16 kHz mono WAV capture; Python and model setup required. |
| Three.js | Supplied classroom and rigged GLB, seven animation clips, dynamic canvas blackboard, and student desk camera. |
| Web Audio | Local send cue, footstep panning, optional low room tone, and narration energy analysis. |
| JSON files | Shared device profile/session/progress in ignored `runtime/student/`; no database or authentication. |

Provider calls remain behind `/api/chat`, `/api/tts`, and `/api/transcribe`. The UI compatibility layer is in `public/api-contract.js`; animation and board rendering are independent of the model provider.

## Earlier component evaluation

The initial prototype reviewed CloneLLM, Charisma, TalkingHead, and MuseTalk. These were architecture reviews, not complete hardware benchmarks:

- **CloneLLM:** its LangChain/LiteLLM dependencies would add another integration layer. Timestamp provenance and bounded board output still require application validation. The current backend calls Ollama directly instead; local embeddings are not implemented, and retrieval uses lexical ranking.
- **Charisma:** a hosted service does not satisfy the standalone local demo requirement.
- **TalkingHead:** needs a compatible rigged character and facial/viseme setup. The supplied GLB has body animation but no speech morph targets, so this integration uses Three.js body choreography.
- **MuseTalk:** adds a GPU video generation pipeline and larger model setup. It has not been benchmarked on this laptop and is not part of the reliable classroom path.

An intermediate version used ElevenLabs. That implementation is retained only in the local backup branch; it is not active in this integration. Historical verification notes explicitly identify that provider.

## Limits

The existing backend’s speech availability checks use Unix `which` and an unquoted Python command. Windows may report unavailable even with a suitable executable; the installed browser voice covers TTS, while microphone transcription still needs a working server Python setup. See `docs/integration.md` for the integration findings. Shared-device memory is not a multi-user security boundary.
