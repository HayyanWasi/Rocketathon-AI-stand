# Classroom integration · 2 October 2026

## Preservation

The UI was integrated on top of teammate commit `87f0c32` (rather than merging the former ElevenLabs implementation). `backend/`, `server.mjs`, `teacher/`, `skills/`, `syllabus/`, `requirements.txt`, `package.json`, and `package-lock.json` remain unchanged. The previous complete app is saved locally in `polish/classroom-experience`.

Modified application surfaces are the classroom UI, browser audio, source/lesson adapters, documentation, tests, and a corrected D02 lecture paraphrase. No provider credentials or runtime student records are published.

## API compatibility

- `/api/library` returns a nested corpus under `passages`; its `index` is absent. `normalizeLibrary()` accepts this shape and canonicalizes external timestamp URLs.
- `/api/chat` citations use `/api/passage?id=...`. The UI keeps passage IDs as the source of provenance and obtains external video/time links from the corpus instead of opening raw JSON.
- `speech_text` and `check.speech` retain Urdu text and `<en>` tags for server eSpeak. Device fallback reads the Roman Urdu display explanation, and speech requests fit the server’s 1,800-character limit.
- Chat/session/referral calls use the shared-device API without pretending that browser IDs provide student isolation.
- Explicit follow-ups include bounded prior lesson context. Ordinary questions retain their exact scope; check attempts never include the hidden solution.

## Verification

- **70 Node tests passed.** Includes an isolated real-server integration test with a loopback Ollama fixture. The fixture is test-only; there are no runtime prewritten physics answers.
- The unchanged server successfully retrieved D06, sent its evidence to the fixture’s structured-model endpoint, validated the response, returned citations/check/board/speech, and saved two session turns in the temporary copy. The normal request-close handler did not prematurely abort the POST. The temporary server and memory were removed after the test.
- Browser inspection confirmed the fullscreen GLB classroom, clean glass controls, correct settings availability, and six real YouTube timestamp links from the nested library. A real out-of-topic question rendered the referral correctly; no browser errors were logged.
- The real local server on port 4317 reported `qwen2.5:0.5b` unavailable, eSpeak unavailable, and faster-whisper unavailable in this environment. No real Ollama lesson, server-generated speech, or human microphone transcription was verified in this integration pass. The isolated fixture test verifies transport/contracts, not model accuracy.
- Voice tests cover configured-unavailable server fallback, installed local voices only, tagged server text versus device display text, cancellation/races, WAV playback, resource cleanup, and request length. Earlier actual-browser sound/device speech results are recorded as historical in `polish-plan.md`.

## Known backend limitations retained

These are documented rather than changing the teammate’s implementation:

- The response schema lists `greeting`, `clarify`, and `feedback`, but the backend validator accepts only `answer` and `escalate`. Other model statuses produce an error; the UI keeps the question available for retry.
- Conversation history is read but not included in model messages. Explicit UI follow-ups compensate with bounded context; unmarked free-form replies may still lose context.
- The topic selector uses the current topic for any question under four tokens. Short unrelated questions can be misrouted; detailed questions are preferable.
- The backend diagram validator turns missing coordinates into zero and may throw on null entries. The UI can bound returned geometry but cannot reconstruct missing values after this validation.
- eSpeak availability uses Unix `which`; Python availability builds an unquoted command. Windows executable paths containing spaces may report unavailable. Installed browser speech is the TTS fallback; transcription still requires a functioning Python bridge.
- A shared-device student profile is unsuitable for authenticated concurrent students. Source validation establishes passage provenance, not every generated claim’s correctness.
