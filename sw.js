/* LK Power Outage Tracker — service worker
   Strategy:
   - versioned static assets (/assets/v1/*, /src/*) → cache-first (immutable)
   - app shell + config.js → network-first (edits land instantly)
   - Supabase API / Nominatim / map tiles → never intercepted (network only) */
const VERSION = 'v1';
const CACHE = 'lkpm-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.js',
  './assets/v1/css/style.css',
  './assets/v1/css/leaflet.css',
  './assets/v1/js/leaflet.js',
  './assets/v1/js/supabase.js',
  './src/utils.js',
  './src/districts.js',
  './src/store.js',
  './src/demo.js',
  './src/db.js',
  './src/map.js',
  './src/ui.js',
  './src/modals.js',
  './src/app.js',
  './assets/v1/favicon.svg',
  './assets/v1/icons/icon-192.png',
  './assets/v1/icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // API + tiles: browser handles

  /* versioned vendor assets (/assets/v1/*) never change for a given path — cache forever */
  if (url.pathname.indexOf('/assets/') === 0) {
    e.respondWith(
      caches.match(req).then(function (m) {
        return m || fetch(req).then(function (res) {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  /* app shell + source code — network-first so deploys reach users immediately */
  e.respondWith(
    fetch(req).then(function (res) {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) {
        if (m) return m;
        if (req.mode === 'navigate') return caches.match('./');
        return new Response('offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
