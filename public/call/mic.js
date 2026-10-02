// Live microphone -> 16 kHz 16-bit PCM frames (ArrayBuffer of 512 samples each).
// Echo cancellation stays on so the teacher's own voice from the speakers is not heard as the student.
export class MicStream {
  async start(onFrame) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false,
    });
    this.context = new AudioContext();
    await this.context.audioWorklet.addModule('/call/mic-worklet.js');
    this.source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, 'mic-downsampler');
    this.node.port.onmessage = e => onFrame(e.data);
    this.source.connect(this.node);
    // keep the graph pulling audio without playing the mic back
    this.mute = this.context.createGain();
    this.mute.gain.value = 0;
    this.node.connect(this.mute).connect(this.context.destination);
  }

  async stop() {
    this.source?.disconnect();
    this.node?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    await this.context?.close();
    this.stream = this.context = this.source = this.node = null;
  }
}
