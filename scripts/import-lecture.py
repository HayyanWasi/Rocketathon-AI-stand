"""Fetch only the selected public lecture's diffraction captions; no paid APIs.
Run from project root: python scripts/import-lecture.py
Requires: pip install youtube-transcript-api==1.2.4
Raw source is preserved. Corrections in data/passages.json remain a reviewed layer.
"""
import json
from pathlib import Path
from youtube_transcript_api import YouTubeTranscriptApi

root = Path(__file__).resolve().parents[1]
video_id = "H5ygtkokVsI"
transcript = YouTubeTranscriptApi().fetch(video_id, languages=["hi"])
segments = [s for s in transcript.to_raw_data() if 26337 <= s["start"] < 26564]
if not segments:
    raise SystemExit("No selected captions found. Existing reviewed data was preserved.")
(root / "data" / "raw-captions.json").write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Saved {len(segments)} timestamped caption segments for {video_id}.")
