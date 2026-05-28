// AutoMark Service Worker
// Bump CACHE on each release; old caches are purged on activate so a stale
// shell can never linger.
const CACHE = "automark-v2";
const OFFLINE_URLS = ["/", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS)));
  // NOTE: no skipWaiting() here — the app prompts the user to reload, then
  // sends SKIP_WAITING. (On a first-ever install there's no controller, so the
  // app applies it silently.)
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// The app posts this when the user accepts an update (or on first install).
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  // Only handle GET; pass API calls straight through.
  if (e.request.method !== "GET" || e.request.url.includes("/api/")) return;
  // Network-first: always fresh when online, cached copy only as offline fallback.
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
