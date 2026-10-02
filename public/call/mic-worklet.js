// Runs on the audio thread: mic Float32 at the device rate (usually 48 kHz)
// -> 16 kHz 16-bit mono PCM frames of ~32 ms, posted to the main thread.
class MicDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;                 // fractional read position into the incoming stream
    this.acc = 0; this.accN = 0;  // box filter accumulator (cheap anti-aliasing)
    this.out = new Int16Array(512);
    this.outN = 0;
  }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.accN++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.acc / this.accN));
        this.acc = 0; this.accN = 0;
        this.out[this.outN++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.outN === this.out.length) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(512);
          this.outN = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('mic-downsampler', MicDownsampler);
