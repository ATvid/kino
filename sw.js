// Service worker: makes the app open with no connection.
//
//  • App files: network first (so updates arrive), falling back to the cached
//    copy after a short wait — at a venue with bad signal the app still opens fast.
//  • vendor/ (the 26 MB recognition runtime) and icons: cache first.
//  • The recognition model itself is cached separately by Transformers.js.
//
// On Chromium it also adds the cross-origin-isolation headers that static hosts
// such as GitHub Pages cannot send; they unlock multi-threaded WebAssembly,
// which makes recognition several times faster.

const CACHE = 'kino-app-v1';
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
  'js/asr-worker.js',
  'js/recorder-worklet.js',
  'vendor/transformers.min.js',
  'vendor/ort-wasm-simd-threaded.asyncify.mjs',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
const NETWORK_WAIT_MS = 2500;
const ISOLATE = /Chrome\//.test(self.navigator.userAgent);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

async function fromNetwork(request, cache) {
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function cacheFirst(request) {
  // Looks in every cache: the page stores the big runtime file in "kino-runtime".
  return (await caches.match(request, { ignoreSearch: true })) || fromNetwork(request, await caches.open(CACHE));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (!cached) return fromNetwork(request, cache);
  if (!self.navigator.onLine) return cached;
  const fresh = fromNetwork(request, cache).catch(() => null);
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS, null));
  const winner = await Promise.race([fresh, timeout]);
  return winner && winner.ok ? winner : cached;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const stable = url.pathname.includes('/vendor/') || url.pathname.includes('/icons/');
  event.respondWith((stable ? cacheFirst(request) : networkFirst(request)).then(isolate));
});
