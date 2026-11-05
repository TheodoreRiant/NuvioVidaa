// Startup measurement for VIDAA TVs. Records boot stages, the first screen,
// long main-thread tasks and how the app's own files were loaded, then sends
// one plain-text report per launch to /api/report (redacted server side).
// This gives real numbers from the TV before and after startup optimizations.

export const STARTUP_REPORT_DELAY_MS = 20000;
const REPORT_ENDPOINT = "/api/report";
const REPORTED_FILES =
  /\/(app\.bundle\.js|core-js\.bundle\.js|bundle\.css|nuvio\.env\.js|hls\.min\.js|dash\.all\.min\.js|boot-guard\.js|legacy-features\.js)$/;

function toMs(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function summarizeTasks(tasks) {
  const durations = tasks.map((task) => task.duration);
  return {
    count: durations.length,
    totalMs: toMs(durations.reduce((sum, value) => sum + value, 0)),
    maxMs: toMs(durations.length ? Math.max(...durations) : 0)
  };
}

export function createStartupRecorder({ now = () => globalThis.performance?.now?.() || 0 } = {}) {
  const stages = [];
  const longTasks = [];
  let firstScreen = null;
  let splash = null;
  return {
    markSplashHidden(info) {
      if (!splash && info) {
        splash = { ms: toMs(info.ms), reason: String(info.reason || "") };
      }
    },
    stage(name) {
      stages.push({ name: String(name || ""), ms: toMs(now()) });
    },
    markFirstScreen(route) {
      if (!firstScreen && route) {
        firstScreen = { route: String(route), ms: toMs(now()) };
      }
    },
    addLongTask(durationMs, startTime) {
      const value = Number(durationMs);
      if (Number.isFinite(value) && value > 0) {
        const start = Number(startTime);
        longTasks.push({ duration: value, start: Number.isFinite(start) ? start : null });
      }
    },
    snapshot() {
      return {
        stages: stages.slice(),
        firstScreen,
        splash,
        longTasks: summarizeTasks(longTasks),
        longTasksAfterSplash: summarizeTasks(
          splash ? longTasks.filter((task) => task.start !== null && task.start >= splash.ms) : []
        )
      };
    }
  };
}

export function summarizeResources(entries, { origin = globalThis.location?.origin || "" } = {}) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => {
      const name = String(entry?.name || "");
      return (!origin || name.startsWith(origin)) && REPORTED_FILES.test(name.split("?")[0]);
    })
    .map((entry) => {
      const transfer = Number(entry.transferSize || 0);
      const decoded = Number(entry.decodedBodySize || 0);
      return {
        file: String(entry.name).split("?")[0].split("/").pop(),
        transferKB: Math.round(transfer / 1024),
        decodedKB: Math.round(decoded / 1024),
        ms: toMs(entry.duration),
        // Served from the HTTP cache or the service worker: no body transferred
        // (a revalidation only moves a few hundred header bytes).
        cached: decoded > 0 && transfer < 1024 && transfer < decoded
      };
    });
}

export function buildStartupReportText({ runtime = {}, profile = {}, snapshot, resources = [] }) {
  const lines = [];
  Object.entries(runtime).forEach(([key, value]) => lines.push(`runtime.${key}: ${value}`));
  Object.entries(profile).forEach(([key, value]) => lines.push(`profile.${key}: ${value}`));
  const first = snapshot?.firstScreen;
  lines.push(`startup.firstScreen: ${first ? `${first.route} @ ${first.ms}ms` : "none"}`);
  if (snapshot?.splash) {
    lines.push(`startup.splashHidden: ${snapshot.splash.ms}ms ${snapshot.splash.reason}`);
  }
  const tasks = snapshot?.longTasks || { count: 0, totalMs: 0, maxMs: 0 };
  lines.push(
    `startup.longTasks: count=${tasks.count} totalMs=${tasks.totalMs} maxMs=${tasks.maxMs}`
  );
  const after = snapshot?.longTasksAfterSplash;
  if (after) {
    lines.push(
      `startup.longTasksAfterSplash: count=${after.count} totalMs=${after.totalMs} maxMs=${after.maxMs}`
    );
  }
  (snapshot?.stages || []).forEach((stage, index) => {
    lines.push(`stage.${index}: ${stage.ms}ms ${stage.name}`);
  });
  resources.forEach((resource) => {
    lines.push(
      `resource.${resource.file}: transferKB=${resource.transferKB} decodedKB=${resource.decodedKB} ms=${resource.ms} cached=${resource.cached}`
    );
  });
  return lines.join("\n");
}

function readChromiumMajor() {
  const match = String(globalThis.navigator?.userAgent || "").match(/Chrom(?:e|ium)\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

// Wires the recorder to the running app. Safe to call once; sends nothing
// unless startRecording() was called (VIDAA only).
export function installVidaaStartupReport({ getRoute, getProfile, fetchImpl = globalThis.fetch }) {
  const recorder = createStartupRecorder();
  let sent = false;
  try {
    new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => recorder.addLongTask(entry.duration, entry.startTime));
    }).observe({ type: "longtask", buffered: true });
  } catch (_) {
    // Long task timing is optional.
  }
  const routePoll = setInterval(() => {
    const route = getRoute?.();
    if (!route) return;
    recorder.markFirstScreen(route);
    clearInterval(routePoll);
    setTimeout(send, STARTUP_REPORT_DELAY_MS);
  }, 250);

  function send() {
    if (sent || typeof fetchImpl !== "function") return;
    sent = true;
    let resources = [];
    try {
      resources = summarizeResources(globalThis.performance.getEntriesByType("resource"));
    } catch (_) {}
    const profile = getProfile?.() || {};
    const text = buildStartupReportText({
      runtime: { userAgent: globalThis.navigator?.userAgent || "", chromium: readChromiumMajor() },
      profile: {
        isPerformanceConstrained: Boolean(profile.isPerformanceConstrained),
        isLegacyTvRuntime: Boolean(profile.isLegacyTvRuntime)
      },
      snapshot: recorder.snapshot(),
      resources
    });
    void fetchImpl(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "app",
        session: Math.random().toString(36).slice(2, 10),
        text
      })
    }).catch(() => {});
  }

  return {
    stage: (name) => recorder.stage(name),
    splashHidden: (info) => recorder.markSplashHidden(info)
  };
}
