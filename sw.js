// Service worker: makes the app open with no connection, and keeps its files
// consistent with each other.
//
// Every release is a complete, versioned set of files, downloaded in one go
// when this script changes and then served from that set only. The app never
// runs with a new copy of one file and an old copy of another. A new release
// takes over the next time the app is opened after it has been fully closed.
//
//   ► When any app file changes, bump VERSION below. Nothing else is needed.
//
//  • vendor/ (the 26 MB recognition runtime) is stored on first use.
//  • The recognition model itself is cached separately by Transformers.js.
//
// On Chromium it also adds the cross-origin-isolation headers that static hosts
// such as GitHub Pages cannot send; they unlock multi-threaded WebAssembly,
// which makes recognition several times faster.

const VERSION = 4;
const CACHE = `kino-app-v${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'pack.json',
  'js/app.js',
  'js/songs.js',
  'js/pack.js',
  'js/matcher.js',
  'js/tracker.js',
  'js/listener.js',
  'js/translit.js',
  'js/linekey.js',
  'js/notes.js',
  'js/asr-worker.js',
  'js/recorder-worklet.js',
  'vendor/transformers.min.js',
  'vendor/ort-wasm-simd-threaded.asyncify.mjs',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
const ISOLATE = /Chrome\//.test(self.navigator.userAgent);
// On a developer's own machine, always take the files from disk so edits show
// up without bumping VERSION (the stored set is still the offline fallback).
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  // "reload" bypasses the browser's own HTTP cache, so the set is all fresh.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
    // First install: start working at once. Updates wait until the app is
    // closed, so a running page is never handed files from two releases.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('kino-app-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

function isolate(response) {
  if (!ISOLATE || !response || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function respond(request) {
  const shell = await caches.open(CACHE);
  if (DEV && !new URL(request.url).pathname.includes('/vendor/')) {
    try {
      const fresh = await fetch(request.url, { cache: 'no-store' });
      if (fresh.ok) return fresh;
    } catch { /* server not running: fall back to the stored set */ }
  }
  // This release's files first; then anything stored on first use (the page
  // keeps the big runtime file in "kino-runtime").
  const hit = (await shell.match(request, { ignoreSearch: true })) ||
    (await caches.match(request, { ignoreSearch: true }));
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && new URL(request.url).pathname.includes('/vendor/')) shell.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(respond(request).then(isolate));
});
