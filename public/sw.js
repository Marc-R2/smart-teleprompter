/*
 * Smart Teleprompter service worker.
 *
 * Why: completes the PWA (manifest.json already existed) so the app can be
 * installed and keeps working offline. Auto-scroll mode needs no internet at
 * all — important for iPhone/iPad users where it is the only mode anyway.
 * (Voice recognition in Chrome still needs internet; that is a browser
 * limitation, not ours.)
 *
 * Strategy:
 *  - HTML/navigation  -> network-first (users always get the newest deploy,
 *                        cached copy only used when offline)
 *  - /assets/*        -> cache-first  (Vite content-hashes these filenames,
 *                        so a cached file can never be stale)
 *  - other same-origin GET (icons, manifest, images) -> stale-while-revalidate
 */

const CACHE_VERSION = "v2";
const CACHE_NAME = `tp-cache-${CACHE_VERSION}`;

// The app may be hosted in a subfolder (GitHub Pages), so nothing assumes "/".
const BASE_PATH = new URL("./", self.location).pathname;

const PRECACHE_URLS = ["./", "app.html", "manifest.json", "logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin
  if (url.pathname.startsWith(`${BASE_PATH}api/`)) return; // never cache API calls

  // 1) Navigations / HTML: network-first, cache fallback for offline
  if (request.mode === "navigate" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(`${BASE_PATH}app.html`))
        )
    );
    return;
  }

  // 2) Hashed build assets: cache-first (immutable by construction)
  if (url.pathname.startsWith(`${BASE_PATH}assets/`)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // 3) Everything else same-origin: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
