// VIDAA on-device diagnostics: pure helpers behind vidaa-diagnostic.html.
import assert from "node:assert/strict";

const {
  MEDIA_PROBES,
  classifySupport,
  probeMediaSupport,
  describeTrackApis,
  listTracks,
  describeKeyEvent,
  describeRuntime,
  normalizeProbeUrl,
  buildReport,
  SAMPLE_MKV_URL,
  resolveVerticalKey
} = await import("../js/platform/vidaa/vidaaDiagnostics.js");

// 1. canPlayType answers map to yes / maybe / no.
assert.equal(classifySupport("probably"), "yes");
assert.equal(classifySupport("maybe"), "maybe");
assert.equal(classifySupport(""), "no");
assert.equal(classifySupport(undefined), "no");

// 2. The probe list covers what debrid addon links and HLS/DASH need.
const probeIds = MEDIA_PROBES.map((probe) => probe.id);
for (const id of ["mp4-h264", "mp4-hevc", "mkv", "hls", "dash", "aac", "ac3", "eac3", "dts"]) {
  assert.ok(probeIds.includes(id), `missing media probe ${id}`);
}
assert.equal(new Set(probeIds).size, probeIds.length, "media probe ids must be unique");

// 3. Media support reads canPlayType and MSE isTypeSupported, and survives
//    runtimes without MediaSource or with a throwing canPlayType.
{
  const video = { canPlayType: (mime) => (mime.includes("avc1") ? "probably" : "") };
  const mediaSource = { isTypeSupported: (mime) => mime.includes("hev1") };
  const results = probeMediaSupport({ video, mediaSource });
  const h264 = results.find((entry) => entry.id === "mp4-h264");
  const hevc = results.find((entry) => entry.id === "mp4-hevc");
  assert.equal(h264.native, "yes");
  assert.equal(h264.mse, "no");
  assert.equal(hevc.native, "no");
  assert.equal(hevc.mse, "yes");

  const noMse = probeMediaSupport({ video, mediaSource: null });
  assert.ok(noMse.every((entry) => entry.mse === "unavailable"));

  const throwing = probeMediaSupport({
    video: {
      canPlayType() {
        throw new Error("boom");
      }
    },
    mediaSource: null
  });
  assert.ok(throwing.every((entry) => entry.native === "error"));
}

// 4. Track APIs: presence of audioTracks / textTracks / videoTracks.
assert.deepEqual(describeTrackApis({ audioTracks: [], textTracks: [] }), {
  audioTracks: true,
  textTracks: true,
  videoTracks: false
});
assert.deepEqual(describeTrackApis(null), {
  audioTracks: false,
  textTracks: false,
  videoTracks: false
});

// 5. Track listing copies language, label, enabled/mode for the report.
{
  const video = {
    audioTracks: [
      { language: "fr", label: "Français", enabled: true },
      { language: "en", label: "", enabled: false }
    ],
    textTracks: [{ language: "fr", label: "Forcés", kind: "subtitles", mode: "disabled" }]
  };
  assert.deepEqual(listTracks(video), {
    audio: [
      { index: 0, language: "fr", label: "Français", enabled: true },
      { index: 1, language: "en", label: "", enabled: false }
    ],
    text: [{ index: 0, language: "fr", label: "Forcés", kind: "subtitles", mode: "disabled" }]
  });
  assert.deepEqual(listTracks({}), { audio: [], text: [] });
}

// 6. Key events: raw fields the remote reports (Back, OK, media keys).
assert.deepEqual(describeKeyEvent({ keyCode: 8, which: 8, key: "Backspace", code: "Backspace" }), {
  keyCode: 8,
  which: 8,
  key: "Backspace",
  code: "Backspace"
});
assert.deepEqual(describeKeyEvent({}), { keyCode: 0, which: 0, key: "", code: "" });

// 7. Runtime facts used to size the port.
{
  const runtime = describeRuntime({
    navigator: { userAgent: "UA VIDAA/7.0", hardwareConcurrency: 4, language: "fr-FR" },
    screen: { width: 1920, height: 1080 },
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    Worker: function Worker() {},
    WebAssembly: {},
    MediaSource: function MediaSource() {},
    fetch() {},
    AbortController: function AbortController() {},
    location: { protocol: "https:", origin: "https://app.example" }
  });
  assert.equal(runtime.userAgent, "UA VIDAA/7.0");
  assert.equal(runtime.screen, "1920x1080");
  assert.equal(runtime.viewport, "1920x1080");
  assert.equal(runtime.devicePixelRatio, 1);
  assert.equal(runtime.worker, true);
  assert.equal(runtime.webAssembly, true);
  assert.equal(runtime.mediaSource, true);
  assert.equal(runtime.origin, "https://app.example");

  const empty = describeRuntime({});
  assert.equal(empty.userAgent, "");
  assert.equal(empty.worker, false);
  assert.equal(empty.mediaSource, false);
}

// 8. Only http(s) URLs are accepted for the playback probe.
assert.equal(normalizeProbeUrl("  https://cdn.example/a.mkv "), "https://cdn.example/a.mkv");
assert.equal(normalizeProbeUrl("http://cdn.example/a.mp4"), "http://cdn.example/a.mp4");
assert.equal(normalizeProbeUrl("javascript:alert(1)"), "");
assert.equal(normalizeProbeUrl("not a url"), "");
assert.equal(normalizeProbeUrl(""), "");

// 9. The report is plain text, one "section.key: value" per line, so it can
//    be photographed or copied off the TV.
{
  const report = buildReport({
    runtime: { userAgent: "UA", worker: true },
    media: [{ id: "hls", native: "maybe", mse: "yes" }],
    keys: [{ keyCode: 8, key: "Backspace" }]
  });
  assert.equal(
    report,
    [
      "runtime.userAgent: UA",
      "runtime.worker: true",
      "media.hls: native=maybe mse=yes",
      "keys.0: keyCode=8 key=Backspace"
    ].join("\n")
  );
  assert.equal(buildReport({}), "");
}

// 10. The packaged diagnostic page loads its own bundle, not the app. The
//     short /d/ copy loads the same bundle from the site root.
{
  const { buildVidaaDiagnosticHtml, buildVidaaIndexHtml } = await import("./package-vidaa.mjs");
  const html = buildVidaaDiagnosticHtml();
  assert.match(html, /<script src="vidaa-diagnostic\.js"><\/script>/);
  assert.doesNotMatch(html, /app\.bundle\.js/);
  assert.match(html, /<div id="app"><\/div>/);
  const shortHtml = buildVidaaDiagnosticHtml({ scriptSrc: "/vidaa-diagnostic.js" });
  assert.match(shortHtml, /<script src="\/vidaa-diagnostic\.js"><\/script>/);
  // The hosted app forces the platform: VIDAA's browser user agent
  // ("... Chrome/111 PageReader/6.1.20 ...") does not always say VIDAA.
  assert.match(buildVidaaIndexHtml(), /window\.__NUVIO_PLATFORM__ = "vidaa";/);
}

// 11. The built-in sample is a public multi-track Matroska file (several audio
//     languages and subtitle tracks), so no URL has to be typed on the TV.
assert.equal(normalizeProbeUrl(SAMPLE_MKV_URL), SAMPLE_MKV_URL);
assert.match(SAMPLE_MKV_URL, /^https:\/\/.+\.mkv$/);

// 12. Up/Down move between controls, and past either end they scroll the
//     page, so the report below the controls can be reached with the remote.
assert.deepEqual(resolveVerticalKey({ index: 0, count: 5, step: 1 }), { focus: 1 });
assert.deepEqual(resolveVerticalKey({ index: 4, count: 5, step: -1 }), { focus: 3 });
assert.deepEqual(resolveVerticalKey({ index: 4, count: 5, step: 1 }), { scroll: 1 });
assert.deepEqual(resolveVerticalKey({ index: 0, count: 5, step: -1 }), { scroll: -1 });
assert.deepEqual(resolveVerticalKey({ index: -1, count: 5, step: 1 }), { scroll: 1 });
assert.deepEqual(resolveVerticalKey({ index: -1, count: 5, step: -1 }), { scroll: -1 });
assert.deepEqual(resolveVerticalKey({ index: 0, count: 0, step: 1 }), { scroll: 1 });

console.log("VIDAA diagnostics helpers passed (media probes, tracks, keys, runtime, report).");
