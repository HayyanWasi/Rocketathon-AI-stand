// A hands-free call with Sir Mahad: mic -> voice service (/ws/call) -> Sir's voice + lesson.
// The voice service listens, transcribes, asks the Node app for the lesson, and streams the answer.
import { MicStream } from './mic.js';
import { PcmPlayer } from './player.js';

export const VOICE_SERVICE = 'ws://127.0.0.1:8765';

export class TeacherCall {
  // handlers: onState(state), onHeard(text, info), onLesson(lesson, question), onLevel(0..1),
  //           onError(message), onMetrics(metrics), onUserSpeaking(bool), onInterrupted()
  constructor(handlers = {}) {
    this.h = handlers;
    this.player = new PcmPlayer(level => this.h.onLevel?.(level));
    this.state = 'off';
  }

  async start() {
    this.player.ensure();  // create the AudioContext inside the click that started the call
    this.ws = new WebSocket(VOICE_SERVICE + '/ws/call');
    this.ws.binaryType = 'arraybuffer';
    await new Promise((ok, bad) => {
      this.ws.onopen = ok;
      this.ws.onerror = () => bad(new Error('Voice service is not running (python voice-service/server.py).'));
    });
    this.ws.onmessage = e => this._onMessage(e.data);
    this.ws.onclose = () => { if (this.state !== 'off') this._setState('off'); };
    this.mic = new MicStream();
    await this.mic.start(frame => this.ws?.readyState === 1 && this.ws.send(frame));
  }

  _onMessage(data) {
    if (data instanceof ArrayBuffer) {
      if (!this.muted) this.player.push(data);  // drop audio still in flight after an interruption
      return;
    }
    const m = JSON.parse(data);
    switch (m.type) {
      case 'state': this._setState(m.value); break;
      case 'interrupted':  // the student started talking over Sir: silence him now
        this.muted = true;
        this.player.stop();
        this.h.onInterrupted?.();
        break;
      case 'vad': this.h.onUserSpeaking?.(m.speaking); break;
      case 'transcript': this.h.onHeard?.(m.text, m); break;
      case 'lesson': this.h.onLesson?.(m.lesson, m.question); break;
      case 'audio_start': this.muted = false; this.player.begin(m.sample_rate); break;
      case 'audio_end':
        if (m.stopped) this.player.stop();
        else this.player.finish(() => this._send({ type: 'played' }));
        break;
      case 'metrics': this.h.onMetrics?.(m); break;
      case 'error': this.h.onError?.(m.message); break;
    }
  }

  _setState(value) {
    this.state = value;
    this.h.onState?.(value);
  }

  _send(obj) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  // Typed question during the call: same path as a spoken one.
  ask(text) { this._send({ type: 'text', text }); }

  // Sir reads this aloud (a typed question's answer, "Read aloud"); the student can still cut in.
  say(text) { this._send({ type: 'say', text }); }

  // Make Sir stop talking now.
  stopSpeaking() {
    this.player.stop();
    this._send({ type: 'stop' });
  }

  async hangup() {
    this._setState('off');
    await this.mic?.stop();
    this.ws?.close();
    await this.player.close();
    this.mic = this.ws = null;
  }
}
