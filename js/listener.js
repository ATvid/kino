// Listener: microphone → rolling audio buffer → on-device speech recognition.
// Emits recognised text with the wall-clock time the clip started, so the
// tracker can anchor the lyrics no matter how long recognition took.

// The "_timestamped" export can report when each word was said, which is what
// lets the lyrics lock on to the exact line.
export const MODEL = 'onnx-community/whisper-base_timestamped';
export const MODEL_MB = 77;

const RATE = 16000;
const CLIP_SECONDS = 15; // how much audio each recognition pass looks at
const MIN_CLIP_SECONDS = 6;
const MIN_NEW_SECONDS = 3; // don't re-run on nearly the same audio
const RELAXED_NEW_SECONDS = 8; // …and take it easier once the lyrics are in sync (battery, heat)
const MODEL_FLAG = 'kino.model.ready';

const nowSec = () => performance.now() / 1000;

/** Was the model downloaded before (so listening can work offline)? */
export async function modelIsCached() {
  if (localStorage.getItem(MODEL_FLAG) !== MODEL) return false;
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((k) => k.url.includes(MODEL) && k.url.endsWith('.onnx'));
  } catch {
    return false;
  }
}

/**
 * The 26 MB WebAssembly runtime is too big to pre-cache for everyone, so it is
 * stored the first time recognition is set up. The service worker serves it
 * from there when offline.
 */
async function keepRuntimeOffline() {
  try {
    const url = new URL('../vendor/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href;
    const cache = await caches.open('kino-runtime');
    if (!(await cache.match(url))) await cache.add(url);
  } catch (err) {
    console.warn('Could not store the recognition runtime for offline use:', err);
  }
}

export class Listener extends EventTarget {
  constructor() {
    super();
    this.worker = null;
    this.modelState = 'idle'; // idle | loading | ready | error
    this.modelPromise = null;
    this.busy = false;
    this.listening = false;
    this.ring = new Float32Array(RATE * 30);
    this.written = 0; // total samples ever written
    this.lastBlockAt = 0; // wall time the newest sample arrived
    this.lastClipEnd = 0; // `written` at the end of the previous clip
    this.jobId = 0;
    this.jobs = new Map();
    this.relaxed = false; // set by the app while the position is confirmed
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // ---- model ----

  /** Download (first time) and load the recognition model. Safe to call repeatedly. */
  loadModel() {
    if (this.modelPromise) return this.modelPromise;
    this.modelPromise = this.startWorker(0).catch((err) => {
      // Multi-threaded WebAssembly can fail on memory-constrained phones: retry single-threaded.
      console.warn('Model load failed, retrying single-threaded:', err);
      return this.startWorker(1);
    }).then(() => keepRuntimeOffline()).then(() => {
      this.modelState = 'ready';
      localStorage.setItem(MODEL_FLAG, MODEL);
      this.emit('model', { state: 'ready' });
      this.pump();
    }).catch((err) => {
      this.modelState = 'error';
      this.modelPromise = null;
      this.emit('model', { state: 'error', message: String(err?.message || err) });
      throw err;
    });
    return this.modelPromise;
  }

  startWorker(threads) {
    this.worker?.terminate();
    this.modelState = 'loading';
    this.emit('model', { state: 'loading', loaded: 0, total: 0 });
    const worker = new Worker(new URL('./asr-worker.js', import.meta.url), { type: 'module' });
    this.worker = worker;
    return new Promise((resolve, reject) => {
      worker.onerror = (e) => reject(new Error(e.message || 'Recognition worker failed to start'));
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') this.emit('model', { state: 'loading', loaded: m.loaded, total: m.total });
        else if (m.type === 'ready') resolve();
        else if (m.type === 'error' && m.during === 'load') reject(new Error(m.message));
        else if (m.type === 'result') this.onResult(m);
        else if (m.type === 'error') this.onResult({ id: m.id, error: m.message });
      };
      worker.postMessage({ type: 'load', model: MODEL, threads });
    });
  }

  // ---- microphone ----

  async start() {
    if (this.listening) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot access the microphone.');
    // Music, not a phone call: turn the voice-call processing off.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    await this.ctx.audioWorklet.addModule(new URL('./recorder-worklet.js', import.meta.url));
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'recorder', { numberOfInputs: 1, numberOfOutputs: 0 });
    this.node.port.onmessage = (e) => this.onAudio(e.data);
    this.source.connect(this.node);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.written = 0;
    this.lastClipEnd = 0;
    this.listening = true;
    this.emit('state', { listening: true });
    this.loadModel().catch(() => {});
  }

  stop() {
    if (!this.listening) return;
    this.listening = false;
    this.node?.port && (this.node.port.onmessage = null);
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
    this.stream = this.ctx = this.source = this.node = null;
    this.emit('state', { listening: false });
  }

  onAudio(block) {
    const ring = this.ring;
    const at = this.written % ring.length;
    const first = Math.min(block.length, ring.length - at);
    ring.set(block.subarray(0, first), at);
    if (first < block.length) ring.set(block.subarray(first), 0);
    this.written += block.length;
    this.lastBlockAt = nowSec();
    let peak = 0;
    for (let i = 0; i < block.length; i += 8) peak = Math.max(peak, Math.abs(block[i]));
    this.emit('level', { peak });
    this.pump();
  }

  /** Start a recognition pass if we are idle and have enough fresh audio. */
  pump() {
    if (!this.listening || this.busy || this.modelState !== 'ready') return;
    const available = Math.min(this.written, this.ring.length);
    if (available < MIN_CLIP_SECONDS * RATE) return;
    const minNew = this.relaxed ? RELAXED_NEW_SECONDS : MIN_NEW_SECONDS;
    if (this.written - this.lastClipEnd < minNew * RATE) return;

    const n = Math.min(available, CLIP_SECONDS * RATE);
    const clip = new Float32Array(n);
    const end = this.written % this.ring.length;
    const start = (end - n + this.ring.length) % this.ring.length;
    if (start < end) clip.set(this.ring.subarray(start, end));
    else {
      clip.set(this.ring.subarray(start));
      clip.set(this.ring.subarray(0, end), this.ring.length - start);
    }
    // Normalise loudness (phones vary a lot, and automatic gain is off).
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(clip[i]));
    if (peak < 0.002) return; // silence: nothing to recognise
    const gain = 0.9 / peak;
    for (let i = 0; i < n; i++) clip[i] *= gain;

    const id = ++this.jobId;
    this.jobs.set(id, { clipStart: this.lastBlockAt - n / RATE, seconds: n / RATE });
    this.lastClipEnd = this.written;
    this.busy = true;
    this.emit('busy', { busy: true });
    this.worker.postMessage({ type: 'transcribe', id, audio: clip }, [clip.buffer]);
  }

  onResult(m) {
    const job = this.jobs.get(m.id);
    this.jobs.delete(m.id);
    this.busy = false;
    this.emit('busy', { busy: false });
    if (job && !m.error && this.listening) {
      this.emit('heard', { text: m.text, chunks: m.chunks, clipStart: job.clipStart, seconds: job.seconds, ms: m.ms });
    } else if (m.error) {
      console.warn('Recognition failed:', m.error);
    }
    this.pump();
  }
}
