"use strict";

// Simple offline-first service worker for Eat Track.
// Static shell is cached; API calls always go to the network.

const CACHE = "eattrack-v20";
const SHELL = [
  "./",
  "./index.html",
  "./greutate.html",
  "./obiective.html",
  "./styles.css",
  "./foods.js",
  "./parser.js",
  "./store.js",
  "./localapi.js",
  "./common.js",
  "./meals.js",
  "./weight.js",
  "./goals.js",
  "./icon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache API responses — always hit the network so data stays fresh.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Cache-first for the static shell, with a network fallback that also
  // refreshes the cache in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fromNet = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fromNet;
    })
  );
});
