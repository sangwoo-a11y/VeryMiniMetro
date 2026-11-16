const CACHE_PREFIX = "very-mini-metro-shell-";
const CACHE = `${CACHE_PREFIX}10`;
const APP_FILES = [
  "./",
  "index.html",
  "style.css?v=10",
  "game.js?v=10",
  "simulation.js?v=10",
  "maps.js?v=10",
  "motion.js?v=10",
  "theme.js?v=10",
  "install.js?v=10",
  "manifest.webmanifest",
  "icons/metro.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
].map((path) => new URL(path, self.location.href).href);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(new URL("index.html", self.location.href)),
      ),
    );
  } else if (APP_FILES.includes(request.url)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
