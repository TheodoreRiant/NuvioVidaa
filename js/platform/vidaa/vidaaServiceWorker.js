// VIDAA app-shell service worker, bundled into sw.js by scripts/package-vidaa.mjs.
// Keeps the app's own files on the TV so later launches skip the download,
// and lets Chromium reuse compiled code for cached scripts. Each deploy gets
// a new cache version; older caches are deleted when the new worker activates.
/* global __VIDAA_CACHE_NAME__ */
import { classifyRequest, VIDAA_PRECACHE_FILES } from "./vidaaCacheRoutes.js";

const CACHE_NAME = __VIDAA_CACHE_NAME__;
const CACHE_PREFIX = "nuvio-vidaa-";
const scope = self.registration ? self.registration.scope : self.location.origin + "/";
const ORIGIN = new URL(scope).origin;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          VIDAA_PRECACHE_FILES.map((file) => new Request(new URL(file, scope), { cache: "reload" }))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

function storeIfOk(request, response) {
  if (response && response.ok && response.type === "basic") {
    const copy = response.clone();
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(request, copy))
      .catch(() => {});
  }
  return response;
}

function cacheFirst(request) {
  return caches
    .match(request)
    .then((cached) => cached || fetch(request).then((response) => storeIfOk(request, response)));
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => storeIfOk(request, response))
    .catch(() =>
      caches
        .match(request)
        .then((cached) => cached || caches.match(new URL("index.html", scope).href))
        .then((cached) => cached || Response.error())
    );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const kind = classifyRequest({
    url: request.url,
    method: request.method,
    mode: request.mode,
    origin: ORIGIN
  });
  if (kind === "cache-first") {
    event.respondWith(cacheFirst(request));
  } else if (kind === "network-first") {
    event.respondWith(networkFirst(request));
  }
  // "bypass": let the browser handle it as if no worker existed.
});
