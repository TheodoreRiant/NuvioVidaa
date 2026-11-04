// Pure helpers behind the VIDAA on-device diagnostic page
// (vidaa-diagnostic.html). They read only what is handed to them, so the
// page can run them on the TV and Node can test them.

export const MEDIA_PROBES = Object.freeze([
  { id: "mp4-h264", label: "MP4 H.264", mime: 'video/mp4; codecs="avc1.640028"' },
  { id: "mp4-hevc", label: "MP4 HEVC", mime: 'video/mp4; codecs="hev1.1.6.L150.B0"' },
  { id: "mp4-hevc-main10", label: "MP4 HEVC Main10", mime: 'video/mp4; codecs="hvc1.2.4.L153.B0"' },
  { id: "mp4-av1", label: "MP4 AV1", mime: 'video/mp4; codecs="av01.0.08M.08"' },
  { id: "webm-vp9", label: "WebM VP9", mime: 'video/webm; codecs="vp9"' },
  { id: "mkv", label: "Matroska", mime: "video/x-matroska" },
  { id: "mkv-alt", label: "Matroska (webm-style)", mime: "video/mkv" },
  { id: "hls", label: "HLS (native)", mime: "application/vnd.apple.mpegurl" },
  { id: "dash", label: "DASH (native)", mime: "application/dash+xml" },
  { id: "aac", label: "AAC", mime: 'audio/mp4; codecs="mp4a.40.2"' },
  { id: "ac3", label: "Dolby Digital (AC-3)", mime: 'audio/mp4; codecs="ac-3"' },
  { id: "eac3", label: "Dolby Digital Plus (E-AC-3)", mime: 'audio/mp4; codecs="ec-3"' },
  { id: "dts", label: "DTS", mime: 'audio/mp4; codecs="dtsc"' },
  { id: "opus", label: "Opus", mime: 'audio/mp4; codecs="opus"' },
  { id: "flac", label: "FLAC", mime: 'audio/mp4; codecs="flac"' }
]);

export function classifySupport(value) {
  if (value === "probably") return "yes";
  if (value === "maybe") return "maybe";
  return "no";
}

function probeNative(video, mime) {
  if (!video || typeof video.canPlayType !== "function") return "unavailable";
  try {
    return classifySupport(video.canPlayType(mime));
  } catch (_) {
    return "error";
  }
}

function probeMse(mediaSource, mime) {
  if (!mediaSource || typeof mediaSource.isTypeSupported !== "function") return "unavailable";
  try {
    return mediaSource.isTypeSupported(mime) ? "yes" : "no";
  } catch (_) {
    return "error";
  }
}

export function probeMediaSupport({ video = null, mediaSource = null } = {}) {
  return MEDIA_PROBES.map((probe) => ({
    id: probe.id,
    label: probe.label,
    mime: probe.mime,
    native: probeNative(video, probe.mime),
    mse: probeMse(mediaSource, probe.mime)
  }));
}

export function describeTrackApis(video) {
  return {
    audioTracks: Boolean(video && video.audioTracks),
    textTracks: Boolean(video && video.textTracks),
    videoTracks: Boolean(video && video.videoTracks)
  };
}

function toArray(list) {
  if (!list) return [];
  try {
    return Array.from(list);
  } catch (_) {
    return [];
  }
}

export function listTracks(video) {
  return {
    audio: toArray(video?.audioTracks).map((track, index) => ({
      index,
      language: String(track?.language || ""),
      label: String(track?.label || ""),
      enabled: Boolean(track?.enabled)
    })),
    text: toArray(video?.textTracks).map((track, index) => ({
      index,
      language: String(track?.language || ""),
      label: String(track?.label || ""),
      kind: String(track?.kind || ""),
      mode: String(track?.mode || "")
    }))
  };
}

export function describeKeyEvent(event) {
  return {
    keyCode: Number(event?.keyCode || 0),
    which: Number(event?.which || 0),
    key: String(event?.key || ""),
    code: String(event?.code || "")
  };
}

function size(width, height) {
  const w = Number(width || 0);
  const h = Number(height || 0);
  return w && h ? `${w}x${h}` : "";
}

export function describeRuntime(runtime = {}) {
  const navigatorRef = runtime.navigator || {};
  return {
    userAgent: String(navigatorRef.userAgent || ""),
    language: String(navigatorRef.language || ""),
    hardwareConcurrency: Number(navigatorRef.hardwareConcurrency || 0),
    screen: size(runtime.screen?.width, runtime.screen?.height),
    viewport: size(runtime.innerWidth, runtime.innerHeight),
    devicePixelRatio: Number(runtime.devicePixelRatio || 0),
    origin: String(runtime.location?.origin || ""),
    protocol: String(runtime.location?.protocol || ""),
    worker: typeof runtime.Worker === "function",
    webAssembly: Boolean(runtime.WebAssembly),
    mediaSource: typeof runtime.MediaSource === "function",
    fetch: typeof runtime.fetch === "function",
    abortController: typeof runtime.AbortController === "function"
  };
}

export function normalizeProbeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch (_) {
    return "";
  }
}

function formatValue(value) {
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => key !== "id" && key !== "label" && key !== "mime")
      .map(([key, entry]) => `${key}=${entry}`)
      .join(" ");
  }
  return String(value);
}

export function buildReport(sections = {}) {
  const lines = [];
  Object.entries(sections).forEach(([section, content]) => {
    if (Array.isArray(content)) {
      content.forEach((entry, index) => {
        const key = entry && typeof entry === "object" && entry.id ? entry.id : String(index);
        lines.push(`${section}.${key}: ${formatValue(entry)}`);
      });
      return;
    }
    if (content && typeof content === "object") {
      Object.entries(content).forEach(([key, value]) => {
        lines.push(`${section}.${key}: ${formatValue(value)}`);
      });
    }
  });
  return lines.join("\n");
}
