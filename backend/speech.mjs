import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, execSync} from 'node:child_process';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = path.join(root, 'runtime');

// Sir Mahad's cloned voice runs in the Python voice service (voice-service/server.py).
// eSpeak NG stays as a fallback when that service is not running.
const VOICE_URL = (process.env.VOICE_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '');
let voiceService = { ok: false, voice: null };

async function checkVoiceService() {
  try {
    const r = await fetch(VOICE_URL + '/health', { signal: AbortSignal.timeout(1500) });
    const d = await r.json();
    voiceService = { ok: r.ok && d.ok, voice: d.voice };
  } catch { voiceService = { ok: false, voice: null }; }
  return voiceService;
}
await checkVoiceService();
setInterval(checkVoiceService, 10000).unref();

export function ttsAvailable() {
  if (voiceService.ok) return true;
  try { execSync(process.platform === 'win32' ? 'where espeak-ng' : 'which espeak-ng', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

export function ttsLabel() {
  if (voiceService.ok) return 'Sir Mahad cloned voice';
  return ttsAvailable() ? 'eSpeak NG (fallback)' : 'unavailable';
}

export function sttAvailable() {
  try {
    let python = process.env.WHISPER_PYTHON;
    if (!python) {
      try { python = fsSync.readFileSync(path.join(runtimeDir, 'python-path.txt'), 'utf8').trim(); } catch {}
    }
    python = python || 'python3';
    execSync(`${python} -c "import faster_whisper"`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

export async function synthesize(text, lang = 'ur') {
  if (!text) return Buffer.from([]);
  const safeText = text.length > 2000 ? text.substring(0, 2000) : text;
  const tempWav = path.join(runtimeDir, `tts_${crypto.randomUUID()}.wav`);
  
  await fs.mkdir(runtimeDir, { recursive: true }).catch(()=>{});
  
  return new Promise((resolve, reject) => {
    const voice = lang === 'en' ? 'en' : 'ur';
    const p = spawn('espeak-ng', ['-v', voice, '-w', tempWav, '-s', '140', '--stdin']);
    p.on('error', reject);
    p.on('close', async (code) => {
      if (code !== 0) return reject(new Error(`espeak-ng failed with code ${code}`));
      try {
        const buf = await fs.readFile(tempWav);
        await fs.unlink(tempWav).catch(()=>{});
        resolve(buf);
      } catch (e) { reject(e); }
    });
    p.stdin.write(safeText);
    p.stdin.end();
  });
}

export async function synthesizeMixed(speechText) {
  if (!speechText) return Buffer.from([]);
  if (voiceService.ok || (await checkVoiceService()).ok) {
    try {
      // The voice service understands the <en>…</en> tags and cleans the text itself.
      const r = await fetch(VOICE_URL + '/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: speechText }),
        signal: AbortSignal.timeout(60000),
      });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      console.error('Voice service TTS failed:', r.status, await r.text());
    } catch (e) {
      console.error('Voice service unreachable, using eSpeak:', e.message);
      voiceService = { ok: false, voice: null };
    }
  }
  return espeakMixed(speechText);
}

async function espeakMixed(speechText) {
  const segments = [];
  let currentText = speechText;
  while (currentText.length > 0) {
    const startIdx = currentText.indexOf('<en>');
    if (startIdx === -1) {
      if (currentText.trim()) segments.push({ lang: 'ur', text: currentText.trim() });
      break;
    }
    if (startIdx > 0) {
      const urText = currentText.substring(0, startIdx).trim();
      if (urText) segments.push({ lang: 'ur', text: urText });
    }
    const endIdx = currentText.indexOf('</en>', startIdx);
    if (endIdx === -1) {
      segments.push({ lang: 'en', text: currentText.substring(startIdx + 4).trim() });
      break;
    }
    const enText = currentText.substring(startIdx + 4, endIdx).trim();
    if (enText) segments.push({ lang: 'en', text: enText });
    currentText = currentText.substring(endIdx + 5);
  }

  if (segments.length === 0) return Buffer.from([]);
  
  const bufs = [];
  for (const seg of segments) {
    const buf = await synthesize(seg.text, seg.lang);
    if (buf.length > 0) bufs.push(buf);
  }
  
  if (bufs.length === 0) return Buffer.from([]);
  if (bufs.length === 1) return bufs[0];
  
  const header = bufs[0].subarray(0, 44);
  const pcmData = bufs.map((b, i) => i === 0 ? b.subarray(44) : (b.length > 44 ? b.subarray(44) : Buffer.from([])));
  
  const totalPcmLen = pcmData.reduce((acc, val) => acc + val.length, 0);
  const combined = Buffer.concat([header, ...pcmData]);
  
  combined.writeUInt32LE(totalPcmLen + 36, 4);
  combined.writeUInt32LE(totalPcmLen, 40);
  
  return combined;
}

export async function transcribe(wavBuffer) {
  let python = process.env.WHISPER_PYTHON;
  if (!python) {
    try { python = await fs.readFile(path.join(runtimeDir, 'python-path.txt'), 'utf8'); python = python.trim(); } catch {}
  }
  python = python || 'python3';
  
  return new Promise((resolve, reject) => {
    const p = spawn(python, [path.join(root, 'backend/whisper-bridge.py')], { cwd: root, windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill(); reject(new Error('Whisper timed out')); }, 60000);
    p.stdout.on('data', b => out += b);
    p.stderr.on('data', b => err += b);
    p.on('error', e => { clearTimeout(timer); reject(new Error('Python bridge unavailable: ' + e.message)); });
    p.on('close', code => {
      clearTimeout(timer);
      try {
        const msg = JSON.parse(out);
        msg.ok ? resolve(msg.result) : reject(new Error(msg.error));
      } catch (e) {
        reject(new Error('Whisper bridge failed: ' + (err.slice(0, 350) || e.message)));
      }
    });
    p.stdin.end(JSON.stringify({ audioBase64: wavBuffer.toString('base64'), model: 'base' }));
  });
}
