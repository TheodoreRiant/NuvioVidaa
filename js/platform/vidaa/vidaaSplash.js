// VIDAA startup splash. The VIDAA page paints the Nuvio logo before any
// script runs (see buildVidaaIndexHtml); this module hides it once the first
// screen is up and the TV has stopped stalling, so the user never drives a
// lagging UI. Remote keys are swallowed by the page while the splash shows.

export const SPLASH_ELEMENT_ID = "nuvio-vidaa-splash";
// Tuned on a 43A60LEVS: 0.7 s of quiet hid the splash while home still stalled.
export const SPLASH_QUIET_MS = 1500;
export const SPLASH_MAX_AFTER_FIRST_SCREEN_MS = 9000;
export const SPLASH_HARD_MAX_MS = 25000;
const CHECK_INTERVAL_MS = 200;
const FADE_MS = 250;

export function decideSplash({ now, firstScreenAt, lastLongTaskEndAt }) {
  if (firstScreenAt == null) {
    return now > SPLASH_HARD_MAX_MS ? { hide: true, reason: "hard-max" } : { hide: false };
  }
  if (now - firstScreenAt >= SPLASH_MAX_AFTER_FIRST_SCREEN_MS) {
    return { hide: true, reason: "max-after-first-screen" };
  }
  const quietSince = Math.max(firstScreenAt, Number(lastLongTaskEndAt) || 0);
  return now - quietSince >= SPLASH_QUIET_MS ? { hide: true, reason: "quiet" } : { hide: false };
}

export function installVidaaSplash({ getRoute, onHidden } = {}) {
  const documentRef = globalThis.document;
  const splash = documentRef?.getElementById?.(SPLASH_ELEMENT_ID);
  if (!splash) return;
  const now = () => globalThis.performance?.now?.() || Date.now();
  let firstScreenAt = null;
  let lastLongTaskEndAt = 0;
  let observer = null;
  try {
    observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        lastLongTaskEndAt = Math.max(lastLongTaskEndAt, entry.startTime + entry.duration);
      });
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch (_) {
    // Without long task timing the quiet period starts at the first screen.
  }
  const timer = setInterval(() => {
    if (firstScreenAt == null && getRoute?.()) {
      firstScreenAt = now();
    }
    const decision = decideSplash({ now: now(), firstScreenAt, lastLongTaskEndAt });
    if (!decision.hide) return;
    clearInterval(timer);
    observer?.disconnect?.();
    globalThis.__NUVIO_SPLASH_ACTIVE__ = false;
    splash.style.opacity = "0";
    setTimeout(() => splash.remove(), FADE_MS);
    onHidden?.({ ms: Math.round(now()), reason: decision.reason });
  }, CHECK_INTERVAL_MS);
}
