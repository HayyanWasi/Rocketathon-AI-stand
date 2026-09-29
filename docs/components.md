# Current components and prior evaluation

| Component | Current role |
|---|---|
| [ElevenLabs Agents](https://elevenlabs.io/docs/eleven-agents/guides/chat-mode) | Creates a lesson from the active student’s selected lecture evidence. Text-only agent sessions use a private server bridge. |
| [ElevenLabs Text to Speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) | Speaks answers in a stock demo voice. No teacher voice clone has been created. |
| [ElevenLabs Scribe](https://elevenlabs.io/docs/api-reference/speech-to-text/convert) | Transcribes recorded questions. A live WAV speech sample was recognized successfully. |
| Local files | Topic index, corrected source passages, persona, and separate active student history. |
| Three.js portrait | Generated low-poly 2.5D avatar with audio level motion. |

Earlier options were evaluated for the original offline plan: CloneLLM added older LangChain/LiteLLM dependencies and did not protect timestamp provenance by default; Charisma is cloud hosted; TalkingHead needs a rigged GLB; MuseTalk is heavy for a 4 GB laptop. The user subsequently selected ElevenLabs, so Ollama, local embedding models and eSpeak are no longer runtime dependencies.

The secret key is loaded by the server from an environment variable or ignored local file. ElevenLabs processes questions and audio remotely; do not describe this build as fully offline or free of usage limits. The local student ID is not a security boundary. A hosted multi-user release needs authentication and access control.
