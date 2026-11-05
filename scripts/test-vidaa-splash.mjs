// VIDAA splash: the Nuvio logo covers the app from the first paint until the
// first screen is ready and the TV has stopped stalling, so the user never
// drives a lagging UI. The decision logic is pure; the page markup and the
// app-shell cache must include the splash.
import assert from "node:assert/strict";

const {
  decideSplash,
  SPLASH_QUIET_MS,
  SPLASH_MAX_AFTER_FIRST_SCREEN_MS,
  SPLASH_HARD_MAX_MS,
  SPLASH_ELEMENT_ID
} = await import("../js/platform/vidaa/vidaaSplash.js");
const { buildVidaaIndexHtml } = await import("./package-vidaa.mjs");
const { VIDAA_PRECACHE_FILES } = await import("../js/platform/vidaa/vidaaCacheRoutes.js");

// 1. Before the first screen the splash stays, unless startup is stuck.
assert.deepEqual(decideSplash({ now: 3000, firstScreenAt: null, lastLongTaskEndAt: 0 }), {
  hide: false
});
assert.deepEqual(
  decideSplash({ now: SPLASH_HARD_MAX_MS + 1, firstScreenAt: null, lastLongTaskEndAt: 0 }),
  { hide: true, reason: "hard-max" }
);

// 2. After the first screen it waits for a quiet main thread.
assert.deepEqual(decideSplash({ now: 4500, firstScreenAt: 4400, lastLongTaskEndAt: 4300 }), {
  hide: false
});
assert.deepEqual(
  decideSplash({ now: 4400 + SPLASH_QUIET_MS, firstScreenAt: 4400, lastLongTaskEndAt: 4300 }),
  { hide: true, reason: "quiet" }
);
// A long task after the first screen restarts the quiet period.
assert.deepEqual(decideSplash({ now: 6000, firstScreenAt: 4400, lastLongTaskEndAt: 5800 }), {
  hide: false
});
assert.deepEqual(
  decideSplash({ now: 5800 + SPLASH_QUIET_MS, firstScreenAt: 4400, lastLongTaskEndAt: 5800 }),
  { hide: true, reason: "quiet" }
);

// 3. A TV that keeps stalling still gets its UI after a bounded wait.
assert.deepEqual(
  decideSplash({
    now: 4400 + SPLASH_MAX_AFTER_FIRST_SCREEN_MS,
    firstScreenAt: 4400,
    lastLongTaskEndAt: 4400 + SPLASH_MAX_AFTER_FIRST_SCREEN_MS - 10
  }),
  { hide: true, reason: "max-after-first-screen" }
);

// 4. Bounds stay sensible for a TV (measured: first screen ~4.4 s).
assert.ok(SPLASH_QUIET_MS >= 300 && SPLASH_QUIET_MS <= 1500);
assert.ok(SPLASH_MAX_AFTER_FIRST_SCREEN_MS >= 3000 && SPLASH_MAX_AFTER_FIRST_SCREEN_MS <= 10000);
assert.ok(SPLASH_HARD_MAX_MS >= 15000 && SPLASH_HARD_MAX_MS <= 40000);

// 5. The VIDAA page paints the splash before any script, below the boot
//    guard's error overlay, and swallows remote keys while it is shown.
{
  const html = buildVidaaIndexHtml();
  const splashAt = html.indexOf(`id="${SPLASH_ELEMENT_ID}"`);
  assert.ok(splashAt > 0, "splash element present");
  assert.ok(splashAt < html.indexOf("boot-guard.js"), "splash before the first script");
  assert.match(html, /app_logo_wordmark\.png/);
  assert.match(html, /z-index:\s*2147483000/);
  assert.match(html, /addEventListener\("keydown"/);
}

// 6. The logo is part of the app-shell cache, so it shows instantly offline.
assert.ok(VIDAA_PRECACHE_FILES.includes("assets/brand/app_logo_wordmark.png"));

console.log("VIDAA splash passed (decision, markup, key guard, cache).");
