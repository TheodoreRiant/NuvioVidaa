// Request routing for the VIDAA app-shell service worker (sw.js). Kept free
// of service-worker globals so Node can test it.

// Files every launch needs, stored when the worker installs. Paths are
// relative to the worker's scope (the site root).
export const VIDAA_PRECACHE_FILES = Object.freeze([
  "index.html",
  "boot-guard.js",
  "assets/runtime/legacy-features.js",
  "css/bundle.css",
  "core-js.bundle.js",
  "nuvio.env.js",
  "assets/libs/qrcode-generator.js",
  "app.bundle.js",
  "assets/libs/hls.min.js",
  "assets/libs/dash.all.min.js"
]);

const MEDIA_EXTENSIONS = /\.(mkv|mp4|m4v|webm|avi|mov|ts|m3u8|mpd|mp3|aac|flac|srt|vtt|ass|ssa)$/i;

// Returns "bypass" (network, untouched), "network-first" (pages) or
// "cache-first" (same-origin static assets).
export function classifyRequest({ url, method = "GET", mode = "", origin }) {
  if (String(method).toUpperCase() !== "GET") return "bypass";
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return "bypass";
  }
  if (!origin || parsed.origin !== origin) return "bypass";
  const path = parsed.pathname;
  if (path.startsWith("/api/")) return "bypass";
  if (path === "/sw.js") return "bypass";
  if (path === "/d" || path.startsWith("/d/") || path.startsWith("/vidaa-diagnostic")) {
    return "bypass";
  }
  if (MEDIA_EXTENSIONS.test(path)) return "bypass";
  if (mode === "navigate" || path === "/" || path === "/index.html") return "network-first";
  return "cache-first";
}
