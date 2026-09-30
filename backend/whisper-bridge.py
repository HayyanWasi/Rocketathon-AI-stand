"""Private server-side transport for STT using faster-whisper."""
import base64, json, os, sys, tempfile

def run(job):
    audio_b64 = job.get('audioBase64')
    if not audio_b64: raise RuntimeError('No audioBase64 provided')
    model_size = job.get('model', 'base')
    
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError('faster_whisper not installed. Please pip install faster-whisper.')
    
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    
    audio_data = base64.b64decode(audio_b64)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        tmp.write(audio_data)
        tmp_path = tmp.name
        
    try:
        segments, info = model.transcribe(tmp_path, beam_size=1, language=None)
        text = "".join(segment.text for segment in segments)
        return {'text': text.strip(), 'provider': 'faster-whisper'}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

try:
    job = json.load(sys.stdin)
    print(json.dumps({'ok': True, 'result': run(job)}), flush=True)
except Exception as error:
    print(json.dumps({'ok': False, 'error': str(error)}), flush=True)
