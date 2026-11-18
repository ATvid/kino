// Speech recognition, fully on the device: Whisper running in WebAssembly via
// Transformers.js. The model files are downloaded from the Hugging Face hub
// once and kept in the browser's Cache Storage, so this works offline later.

import { env, pipeline } from '../vendor/transformers.min.js';

// Use the copy of the ONNX runtime that ships with the app (cached by the
// service worker) instead of a CDN.
env.backends.onnx.wasm.wasmPaths = new URL('../vendor/', import.meta.url).href;
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;

async function load({ model, threads }) {
  if (threads) env.backends.onnx.wasm.numThreads = threads;
  const files = new Map();
  transcriber = await pipeline('automatic-speech-recognition', model, {
    device: 'wasm',
    dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files.set(p.file, [p.loaded, p.total]);
      let loaded = 0;
      let total = 0;
      for (const [l, t] of files.values()) { loaded += l; total += t; }
      self.postMessage({ type: 'progress', loaded, total });
    },
  });
  self.postMessage({ type: 'ready', isolated: self.crossOriginIsolated === true });
}

async function transcribe({ id, audio }) {
  const started = performance.now();
  const out = await transcriber(audio, {
    language: 'russian',
    task: 'transcribe',
    return_timestamps: 'word',
    max_new_tokens: 96, // a 15 s clip of lyrics is ~50 tokens; bounds runaway output
  });
  const chunks = (out.chunks || []).map((c) => ({ text: c.text, timestamp: c.timestamp }));
  if (!chunks.length && out.text) chunks.push({ text: out.text, timestamp: [0, null] });
  self.postMessage({ type: 'result', id, text: out.text || '', chunks, ms: performance.now() - started });
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') await load(msg);
    else if (msg.type === 'transcribe') await transcribe(msg);
  } catch (err) {
    self.postMessage({ type: 'error', during: msg.type, id: msg.id, message: String(err?.message || err) });
  }
};
