// AudioWorklet: downsamples microphone audio to 16 kHz mono and posts it to
// the page in ~0.25 s blocks.

const TARGET_RATE = 16000;
const BLOCK = 4000;

class Recorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE; // input samples per output sample
    this.acc = 0; // running sum of the current output sample
    this.count = 0;
    this.phase = 0;
    this.out = new Float32Array(BLOCK);
    this.fill = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const channels = input.length;
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      let s = 0;
      for (let c = 0; c < channels; c++) s += input[c][i];
      // Box-filter decimation: average the input samples that fall into each
      // output sample. Crude anti-aliasing, plenty for speech recognition.
      this.acc += s / channels;
      this.count++;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        this.out[this.fill++] = this.acc / this.count;
        this.acc = 0;
        this.count = 0;
        if (this.fill === BLOCK) {
          this.port.postMessage(this.out, [this.out.buffer]);
          this.out = new Float32Array(BLOCK);
          this.fill = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('recorder', Recorder);
