"""Private server-side transport for ElevenLabs Agents, speech and transcription."""
import base64, io, json, os, sys, time
import requests
import websocket

API = 'https://api.elevenlabs.io/v1'
KEY = os.environ.get('ELEVENLABS_API_KEY', '').strip()
HEADERS = {'xi-api-key': KEY}

def response_json(response):
    try: value = response.json()
    except ValueError: value = {'detail': response.text[:500]}
    if not response.ok: raise RuntimeError(f'ElevenLabs HTTP {response.status_code}: {str(value)[:500]}')
    return value

def run(job):
    if not KEY: raise RuntimeError('Set ELEVENLABS_API_KEY on the server.')
    kind = job['kind']
    if kind == 'health':
        user = response_json(requests.get(API + '/user', headers=HEADERS, timeout=15))
        return {'available': True, 'account': bool(user), 'agentId': job.get('agentId')}
    if kind == 'voices':
        data = response_json(requests.get(API + '/voices', headers=HEADERS, timeout=20))
        return {'voices': [{'id': v['voice_id'], 'name': v['name']} for v in data.get('voices', [])]}
    if kind == 'tts':
        voice = job['voiceId']
        if not voice.isalnum(): raise RuntimeError('Invalid voice ID')
        response = requests.post(API + '/text-to-speech/' + voice,
            headers={**HEADERS, 'Content-Type': 'application/json'},
            params={'output_format': 'mp3_44100_128'},
            json={'text': job['text'], 'model_id': 'eleven_multilingual_v2'}, timeout=90)
        if not response.ok: response_json(response)
        return {'audioBase64': base64.b64encode(response.content).decode(), 'mime': 'audio/mpeg'}
    if kind == 'stt':
        audio = base64.b64decode(job['audioBase64'])
        files = {'file': ('question.wav', io.BytesIO(audio), 'audio/wav')}
        response = requests.post(API + '/speech-to-text', headers=HEADERS,
            data={'model_id': 'scribe_v2'}, files=files, timeout=90)
        data = response_json(response)
        return {'text': data.get('text', ''), 'provider': 'ElevenLabs Scribe'}
    if kind == 'chat':
        agent_id = job['agentId']
        signed = response_json(requests.get(API + '/convai/conversation/get-signed-url',
            headers=HEADERS, params={'agent_id': agent_id}, timeout=20))['signed_url']
        ws = websocket.create_connection(signed, timeout=95)
        try:
            ws.send(json.dumps({'type': 'conversation_initiation_client_data'}))
            ws.send(json.dumps({'type': 'user_message', 'text': job['message']}))
            deadline = time.monotonic() + 95
            while time.monotonic() < deadline:
                event = json.loads(ws.recv())
                typ = event.get('type')
                if typ == 'ping':
                    ws.send(json.dumps({'type': 'pong', 'event_id': event.get('ping_event', {}).get('event_id')}))
                elif typ == 'agent_response':
                    value = event.get('agent_response_event', {}).get('agent_response', '')
                    if value: return {'text': value}
                elif typ in ('error', 'client_error'):
                    raise RuntimeError('ElevenLabs agent error: ' + str(event)[:350])
            raise RuntimeError('ElevenLabs agent response timed out.')
        finally:
            ws.close()
    raise RuntimeError('Unknown bridge operation')

try:
    job = json.load(sys.stdin)
    print(json.dumps({'ok': True, 'result': run(job)}), flush=True)
except Exception as error:
    print(json.dumps({'ok': False, 'error': str(error)}), flush=True)
