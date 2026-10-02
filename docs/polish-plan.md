# Classroom polish plan

> Historical record of the classroom polish before the teammate’s Ollama backend was integrated. Provider-specific and server-memory results below apply to that earlier revision. Current integration status is recorded in `integration.md`.

## Preserve

Keep the fullscreen student desk view, glass transcript/settings, solid ripple composer, supplied character/classroom, dynamic board, source labels and escalation. Do not restore the badges/status card removed by the user. Add no stock music, new avatars or unrelated panels.

## Priorities

1. **Correct lifecycle bugs:** preserve the current route/segment when pausing; blend actual actions without resetting the same clip; prevent old narration callbacks from stopping new audio; release audio nodes and microphone tracks; ignore stale chat results after cancellation/reset.
2. **Make sound support the lesson:** synthesize a short send cue and quiet footsteps locally. Footsteps follow the active walking clip and actual movement. Optional low room air is off by default. Effects are user-controlled, unlock only after interaction, fade smoothly, duck during narration and stop while the page is hidden or recording.
3. **Make explanations easier to use:** normalize simple formula notation for both boards; provide previous/next and automatic/manual progression; retain the last lesson and short notebook history per student across refresh without autoplay; make hints/check follow-ups and re-explanations aware of the previous question.
4. **Keep rendering dependable:** ease board focus camera movement, respect reduced motion, suspend unnecessary background work, validate generated board geometry, retain the current source/general distinction.

## Research behind decisions

- [MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices): initialize/resume audio during user gestures and provide control over sound. Procedural buffers and oscillators avoid downloads and paid assets.
- [MDN spatialization basics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics): position-sensitive audio can convey movement. This prototype uses restrained stereo panning for the front aisle.
- [Three.js AnimationAction](https://threejs.org/docs/pages/AnimationAction.html): crossfades, weights, loop behavior and paused actions require coordinated lifecycle handling.
- [MDN localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService): distinguish installed voices from remote services. The fallback selects installed voices explicitly and keeps cancellation scoped to this lesson.

## Verification gates

Run focused tests for pause/resume, return after interruption, footsteps only while moving, stale voice generations and resource cleanup, notebook bounds, notation normalization, source validation and follow-up/reset handling. Inspect the real classroom UI, preferences, restored lesson and live narration. Check sound generation through an offline render and browser audio graph; do not claim to have heard audio from a screenshot. Limit live questions to one initial lesson and one follow-up needed to verify teaching context.

## Verification results · 30 September 2026

- **57 Node regression tests passed.** Coverage includes animation route/turn/pause/return, frame caps, foot contacts, math, source validation, pending-check context, student isolation/reset/cancellation, bounded browser restoration, voice generations/cache/fallback, and microphone cleanup/resampling.
- Browser tested the real ElevenLabs teaching response and “Explain another way” context. Source links use verified timestamp offsets. Live output exposed a poor doorway analogy and vague quantitative check, so the prompt now restricts lecture examples/checks to supplied physical facts and examples. The refined prompt was not called again to spend remaining credits. Generated teaching still needs human review; deterministic guards do not establish every statement’s correctness.
- Browser reload restored the lesson without narration or choreography autoplay. Previous/next board navigation is bounded and switches off auto timing. Focus camera eases and folds the transcript to keep the board visible; returning restores the previous transcript choice.
- The actual browser OfflineAudioContext rendered production send/footstep nodes: peak **0.02250**, RMS **0.00188**, finite samples, quiet tail, all transient nodes released. This is signal validation, not an auditory evaluation.
- In that revision, ElevenLabs TTS returned **quota_exceeded**: 134 credits remained while the sample needed 483. A local installed device voice subsequently reached its real start callback and displayed **Stop device voice**, then finished. That revision remembered quota failure for the tab. The current build uses the teammate’s local speech backend instead. Device voice pronunciation and pace are browser-dependent; it is not Sir Mahad’s cloned voice.
- Live human microphone input has not been verified in this polish pass. Capture, cancellation, resampling and WAV format are covered by targeted tests. No new packages or audio assets were installed.
