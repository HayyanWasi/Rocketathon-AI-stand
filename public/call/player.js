// Gapless player for Sir's streamed voice (16-bit mono PCM chunks, one per sentence).
// Each chunk is scheduled right after the previous one, so the first sentence plays while
// the next ones are still arriving. onLevel(0..1) drives the avatar's mouth.
export class PcmPlayer {
  constructor(onLevel = () => {}) {
    this.onLevel = onLevel;
    this.sources = new Set();
    this.nextTime = 0;
    this.sampleRate = 22050;
    this.finished = null;
  }

  ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.ctx.destination);
    this.levels = new Uint8Array(this.analyser.fftSize);
    const tick = () => {
      if (!this.ctx) return;
      this.analyser.getByteTimeDomainData(this.levels);
      let sum = 0;
      for (const v of this.levels) sum += (v - 128) * (v - 128);
      this.onLevel(this.sources.size ? Math.min(1, Math.sqrt(sum / this.levels.length) / 40) : 0);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  begin(sampleRate) {
    this.ensure();
    this.ctx.resume();
    this.sampleRate = sampleRate;
    this.finished = null;
  }

  push(arrayBuffer) {
    const pcm = new Int16Array(arrayBuffer);
    if (!pcm.length) return;
    const buf = this.ctx.createBuffer(1, pcm.length, this.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    const start = Math.max(this.ctx.currentTime + 0.03, this.nextTime);
    src.start(start);
    this.nextTime = start + buf.duration;
    this.sources.add(src);
    src.onended = () => { this.sources.delete(src); this._maybeDone(); };
  }

  // All chunks have arrived; call `cb` once the speakers have played the last one.
  finish(cb) {
    this.finished = cb;
    this._maybeDone();
  }

  _maybeDone() {
    if (this.finished && this.sources.size === 0) {
      const cb = this.finished;
      this.finished = null;
      cb();
    }
  }

  // Cut Sir off immediately (new question, hang-up, interruption).
  stop() {
    this.finished = null;
    for (const s of this.sources) { s.onended = null; try { s.stop(); } catch {} }
    this.sources.clear();
    this.nextTime = 0;
    this.onLevel(0);
  }

  async close() {
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    await ctx?.close();
  }
}
