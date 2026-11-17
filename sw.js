/* ==========================================================================
   Lakbay — Service worker
   Offline-capable app shell for the installed PWA.
   Strategies:
   - Navigations (HTML): network-first, cache fallback (updates land instantly,
     offline still opens the app).
   - Static assets (css/js/img/fonts on this origin): stale-while-revalidate.
   - Cross-origin requests (OpenStreetMap tiles) are never intercepted —
     they go straight to the network. Fonts are self-hosted (assets/fonts),
     so typography works offline too.
   ========================================================================== */

const VERSION = 'lakbay-v17';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const PRECACHE = [
  './index.html',
  './client.html',
  './rider.html',
  './manifest.webmanifest',
  './css/global.css',
  './css/fonts.css',
  './css/components.css',
  './css/landing.css',
  './css/client.css',
  './css/rider.css',
  './assets/fonts/sora-latin-wght-normal.woff2',
  './assets/fonts/sora-latin-ext-wght-normal.woff2',
  './assets/fonts/manrope-latin-wght-normal.woff2',
  './assets/fonts/manrope-latin-ext-wght-normal.woff2',
  './vendor/leaflet.js',
  './vendor/leaflet.css',
  './vendor/lucide.min.js',
  './vendor/lenis.min.js',
  './assets/logo/favicon.svg',
  './assets/brand/bolt.svg',
  './assets/brand/pattern-route.svg',
  './assets/logo/icon-192.png',
  './assets/logo/icon-512.png',
  './assets/logo/apple-touch-icon.png',
  './assets/illustrations/hero.png',
  './assets/illustrations/verify.png',
  './assets/illustrations/empty-rides.png',
  './assets/illustrations/empty-search.png',
  './assets/vehicles/moto.png',
  './assets/vehicles/sedan.png',
  './assets/vehicles/premium.png',
  './assets/vehicles/van.png',
  './assets/avatars/d1.png',
  './assets/avatars/d2.png',
  './assets/avatars/d3.png',
  './assets/avatars/p1.png',
  './assets/avatars/p2.png',
  './assets/avatars/p3.png',
  './assets/promos/campaign-car.webp',
  './assets/promos/campaign-scooter.webp',
  './assets/promos/campaign-helmet.webp',
  './assets/promos/campaign-coins.webp',
  './assets/promos/campaign-sedan.webp',
  './assets/promos/campaign-van.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // cache: 'reload' skips the browser's HTTP cache (GitHub Pages sends
      // max-age=600), so a new version never precaches yesterday's files
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiles + fonts: network only

  // Navigations: network-first with cache fallback (offline support)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Code and styles: network-first (cache only when offline). Serving them
  // stale-while-revalidate let a reload pair fresh JS with last version's CSS.
  if (/\.(css|js|mjs)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // Images and fonts: stale-while-revalidate
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      // no-cache: always revalidate with the server, so the refreshed copy is
      // the deployed file, not one held in the HTTP cache
      const network = fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
