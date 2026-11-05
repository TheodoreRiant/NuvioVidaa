// VIDAA startup measurement: boot stages, first screen, long tasks and how
// the app's own files were loaded (network vs cache), sent once per launch.
import assert from "node:assert/strict";

const {
  createStartupRecorder,
  summarizeResources,
  buildStartupReportText,
  STARTUP_REPORT_DELAY_MS
} = await import("../js/platform/vidaa/vidaaStartupReport.js");

// 1. The recorder keeps boot stages and the first screen relative to the
//    page's time origin, and summarizes long tasks.
{
  let clock = 100;
  const recorder = createStartupRecorder({ now: () => clock });
  recorder.stage("Rendering application shell");
  clock = 450;
  recorder.stage("Checking authentication");
  recorder.addLongTask(120);
  recorder.addLongTask(80);
  clock = 2300;
  recorder.markFirstScreen("authQrSignIn");
  clock = 2900;
  recorder.markFirstScreen("home"); // only the first screen counts
  recorder.addLongTask(300);
  const snapshot = recorder.snapshot();
  assert.deepEqual(snapshot.stages, [
    { name: "Rendering application shell", ms: 100 },
    { name: "Checking authentication", ms: 450 }
  ]);
  assert.deepEqual(snapshot.firstScreen, { route: "authQrSignIn", ms: 2300 });
  assert.deepEqual(snapshot.longTasks, { count: 3, totalMs: 500, maxMs: 300 });
}

// 2. Long task input is defensive (bad values are ignored).
{
  const recorder = createStartupRecorder({ now: () => 0 });
  recorder.addLongTask(Number.NaN);
  recorder.addLongTask(-5);
  recorder.addLongTask("x");
  assert.deepEqual(recorder.snapshot().longTasks, { count: 0, totalMs: 0, maxMs: 0 });
  assert.equal(recorder.snapshot().firstScreen, null);
}

// 3. Only the app's own big files are reported, by file name, with transfer
//    size, decoded size, duration, and whether they came from a cache.
{
  const origin = "https://vidaa.allside.studio";
  const resources = summarizeResources(
    [
      {
        name: `${origin}/app.bundle.js`,
        initiatorType: "script",
        transferSize: 937095,
        decodedBodySize: 3585528,
        duration: 2100.4
      },
      {
        name: `${origin}/css/bundle.css`,
        initiatorType: "link",
        transferSize: 0,
        decodedBodySize: 553101,
        duration: 12.2
      },
      {
        name: `${origin}/assets/images/icon.png`,
        initiatorType: "img",
        transferSize: 3564,
        decodedBodySize: 3564,
        duration: 5
      },
      {
        name: "https://image.tmdb.org/t/p/w500/a.jpg",
        initiatorType: "img",
        transferSize: 90000,
        decodedBodySize: 90000,
        duration: 300
      }
    ],
    { origin }
  );
  assert.deepEqual(resources, [
    { file: "app.bundle.js", transferKB: 915, decodedKB: 3501, ms: 2100, cached: false },
    { file: "bundle.css", transferKB: 0, decodedKB: 540, ms: 12, cached: true }
  ]);
  assert.deepEqual(summarizeResources(null, { origin }), []);
}

// 4. The report is plain "section.key: value" text, ready for /api/report.
{
  const text = buildStartupReportText({
    runtime: { userAgent: "UA PageReader/6.1.20", chromium: 111 },
    profile: { isPerformanceConstrained: false, isLegacyTvRuntime: false },
    snapshot: {
      stages: [{ name: "Checking authentication", ms: 450 }],
      firstScreen: { route: "home", ms: 2300 },
      longTasks: { count: 3, totalMs: 500, maxMs: 300 }
    },
    resources: [
      { file: "app.bundle.js", transferKB: 915, decodedKB: 3501, ms: 2100, cached: false }
    ]
  });
  const lines = text.split("\n");
  assert.ok(lines.includes("runtime.userAgent: UA PageReader/6.1.20"));
  assert.ok(lines.includes("profile.isPerformanceConstrained: false"));
  assert.ok(lines.includes("startup.firstScreen: home @ 2300ms"));
  assert.ok(lines.includes("startup.longTasks: count=3 totalMs=500 maxMs=300"));
  assert.ok(lines.includes("stage.0: 450ms Checking authentication"));
  assert.ok(
    lines.includes("resource.app.bundle.js: transferKB=915 decodedKB=3501 ms=2100 cached=false")
  );
}

// 5. The report waits long enough after the first screen to see the lag the
//    user notices at startup.
assert.ok(STARTUP_REPORT_DELAY_MS >= 10000 && STARTUP_REPORT_DELAY_MS <= 30000);

console.log("VIDAA startup report passed (stages, first screen, long tasks, resources).");
