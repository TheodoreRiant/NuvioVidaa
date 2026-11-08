// VIDAA app-shell cache: request routing, cache versioning, and the
// generated service worker / registration in the VIDAA package.
import assert from "node:assert/strict";

const { classifyRequest, VIDAA_PRECACHE_FILES } =
  await import("../js/platform/vidaa/vidaaCacheRoutes.js");
const { buildVidaaServiceWorker, computeCacheVersion, buildVidaaIndexHtml } =
  await import("./package-vidaa.mjs");

const origin = "https://vidaa.allside.studio";
const route = (url, extra = {}) =>
  classifyRequest({ url, method: "GET", mode: "no-cors", origin, ...extra });

// 1. Only same-origin static GETs are cached; the API, other sites (addons,
//    TMDB, debrid CDNs, video streams) and non-GET requests always go to the
//    network untouched.
assert.equal(route(`${origin}/app.bundle.js`), "cache-first");
assert.equal(route(`${origin}/css/bundle.css`), "cache-first");
assert.equal(route(`${origin}/res/values-fr/strings.xml`), "cache-first");
assert.equal(route(`${origin}/assets/fonts/inter.woff2`), "cache-first");
assert.equal(route(`${origin}/api/report`), "bypass");
assert.equal(route(`${origin}/api/report`, { method: "POST" }), "bypass");
assert.equal(route(`${origin}/app.bundle.js`, { method: "POST" }), "bypass");
assert.equal(route("https://torrentio.strem.fun/manifest.json"), "bypass");
assert.equal(route("https://image.tmdb.org/t/p/w500/a.jpg"), "bypass");
assert.equal(route("https://cdn.torbox.example/f.mkv"), "bypass");
assert.equal(route("not a url"), "bypass");

// 2. Pages are network-first so a new deploy is picked up as soon as the TV
//    is online; the cached copy is only a fallback.
assert.equal(route(`${origin}/`, { mode: "navigate" }), "network-first");
assert.equal(route(`${origin}/index.html`), "network-first");
assert.equal(route(`${origin}/?profile=1`, { mode: "navigate" }), "network-first");

// 3. The diagnostic page and media files are never cached.
assert.equal(route(`${origin}/d/`, { mode: "navigate" }), "bypass");
assert.equal(route(`${origin}/vidaa-diagnostic.js`), "bypass");
assert.equal(route(`${origin}/sw.js`), "bypass");
assert.equal(route(`${origin}/movie.mkv`), "bypass");

// 4. The precache list is the app shell that every launch needs.
for (const file of [
  "index.html",
  "boot-guard.js",
  "core-js.bundle.js",
  "nuvio.env.js",
  "app.bundle.js",
  "css/bundle.css",
  "assets/runtime/legacy-features.js",
  "assets/libs/qrcode-generator.js",
  "assets/libs/hls.min.js",
  "assets/libs/dash.all.min.js"
]) {
  assert.ok(VIDAA_PRECACHE_FILES.includes(file), `precaches ${file}`);
}

// 5. The cache version changes whenever any precached file changes, so each
//    deploy installs a fresh cache and drops the old one.
{
  const a = computeCacheVersion([Buffer.from("one"), Buffer.from("two")]);
  const b = computeCacheVersion([Buffer.from("one"), Buffer.from("two")]);
  const c = computeCacheVersion([Buffer.from("one"), Buffer.from("three")]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{16}$/);
}

// 6. The generated worker embeds its version and precache list, and cleans
//    up caches from older versions.
{
  const sw = await buildVidaaServiceWorker({ version: "abc123def4567890" });
  assert.match(sw, /nuvio-vidaa-abc123def4567890/);
  assert.match(sw, /app\.bundle\.js/);
  assert.match(sw, /caches\.delete/);
  assert.doesNotMatch(sw, /import\s|export\s/, "classic script, no ES modules");
}

// 7. The VIDAA page registers the worker after load, without blocking start.
{
  const html = buildVidaaIndexHtml();
  assert.match(html, /serviceWorker/);
  assert.match(html, /register\("sw\.js"/);
  assert.match(html, /addEventListener\("load"/);
}

console.log("VIDAA service worker passed (routing, versioning, worker, registration).");
