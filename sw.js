// Service worker for the Calori Intake PWA.
//
// Strategy: cache-first for the app shell so the app opens instantly and works
// with no network, network-first for navigations so a deployed update is picked
// up as soon as the phone is online again.
//
// Bump CACHE_VERSION whenever a shell file changes - the old cache is dropped on
// activate, which is what makes a `git push` actually reach installed phones.
const CACHE_VERSION = 'v9';
const CACHE_NAME = `calori-intake-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/fonts/fonts.css',
  './assets/fonts/archivo.woff2',
  './assets/fonts/ibmplexmono-400.woff2',
  './assets/fonts/ibmplexmono-500.woff2',
  './assets/fonts/ibmplexmono-600.woff2',
  './assets/js/store.js',
  './assets/js/api.js',
  './assets/js/backup.js',
  './assets/js/weight.js',
  './assets/js/render.js',
  './assets/js/app.js',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // Deliberately no skipWaiting() here: the new worker stays in `waiting` until
  // the page asks for it via the SKIP_WAITING message. That is what lets the
  // app show its "new version" banner and swap only when the user taps it,
  // instead of reloading out from under someone mid-entry.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // addAll is all-or-nothing; add individually so one missing asset does
      // not abort the whole install.
      //
      // `cache: 'reload'` is load-bearing: a plain cache.add() is allowed to
      // satisfy itself from the browser's HTTP cache, and GitHub Pages serves
      // assets with max-age=600. Without it a freshly installed worker can
      // precache the *previous* build's files and the app silently keeps
      // running old code even though the update went through.
      .then((cache) => Promise.all(SHELL.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      )))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

// Lets the page trigger an immediate update instead of waiting for the next
// cold start.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
