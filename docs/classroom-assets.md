# Classroom asset integration

The user supplied `d5d7cefe012f4a86a208de079c801252.zip` (teacher OBJ, material and texture), `classroom.zip` (classroom FBX and textures), and seven Mixamo FBX exports: Pointing, Pointing Forward, Angry Point, Laughing, Walking, Right Turn and Left Turn. The rigged teacher geometry in the animation exports is used directly, with the supplied teacher texture; the earlier generated Sir Mahad model is not used in this scene.

Original files are preserved in the user's Downloads and the workspace `work/classroom-inputs/`. File contents are treated as assets, not project instructions. These archives did not contain license or attribution documents; their original source and publication rights are not established by the archives themselves.

The Three.js FBX loader reads the source geometry and clips. `scripts/prepare-classroom.mjs` exports two GLBs and strips unused particle planes and the static blackboard surface. Animation hips X/Z translation is held in place; the scene controls world movement across the clear front aisle. Clips crossfade on a shared Mixamo skeleton. The FBX loader retains up to four vertex influences to match WebGL skinning. There is no supplied idle clip; the default standing pose holds a pointing frame. There are no supplied facial morph targets or facial speech rig.

Source geometry uses different units: the classroom scales by 0.008, the teacher scales to 1.78 m. The teacher's animated feet are used to set floor height. Textures retain their original FBX UV orientation. A canvas texture replaces the blackboard and consumes only the backend's bounded, validated lesson JSON; generated code or HTML is never executed.

Rendering uses a capped 1.5 device pixel ratio, two directional lights, ambient hemisphere lighting, and a lightweight contact shadow. Both GLBs together are approximately 14 MB; original repeated FBX meshes are kept outside the app. Only the required color textures ship in the app.

The fullscreen revision uses floating glass controls, a collapsible transcript, and a solid composer with a send ripple. `public/choreography.js` defines the walking, turns, board pointing and student pointing sequence; narration duration or silent reading time bounds it. Completion and interruption return the teacher to his original spot. The current teammate backend scopes instruction to the diffraction lecture and refers other topics to Sir Mahad.

Historical verification before backend integration: syntax checks and all 11 automated checks passed, including sequence completion, interrupted return, and general-mode citation validation. An earlier ElevenLabs build supplied a live Roman Urdu diffraction answer, board, and check question, and also tested a general-mode Newton's law response. That provider and general mode are no longer active. Current checks are documented in `integration.md`. Microphone permissions and human-audio transcription were not exercised in those classroom revisions.
