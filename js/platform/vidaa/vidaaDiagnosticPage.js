// VIDAA on-device diagnostic page. Bundled by scripts/package-vidaa.mjs into
// vidaa-diagnostic.js and opened as vidaa-diagnostic.html on the TV.
// Optional query: ?url=<media URL> pre-fills the playback probe,
// ?addon=<manifest URL> the addon probe.
import {
  buildReport,
  describeKeyEvent,
  describeRuntime,
  describeTrackApis,
  listTracks,
  normalizeProbeUrl,
  probeMediaSupport,
  resolveVerticalKey,
  SAMPLE_MKV_URL
} from "./vidaaDiagnostics.js";
import { REPORT_SOURCES } from "./vidaaReport.js";

const DEFAULT_ADDON_URL = "https://torrentio.strem.fun/manifest.json";
const MAX_KEYS = 12;
const MAX_EVENTS = 40;
const VIDEO_EVENTS = [
  "loadstart",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "playing",
  "waiting",
  "stalled",
  "pause",
  "ended",
  "error"
];

const state = {
  runtime: describeRuntime(globalThis),
  media: [],
  trackApis: {},
  keys: [],
  addon: { status: "not run" },
  playback: { status: "not run" },
  events: [],
  tracks: { audio: [], text: [] }
};

function element(tag, attributes = {}, text = "") {
  const node = document.createElement(tag);
  Object.keys(attributes).forEach((name) => node.setAttribute(name, attributes[name]));
  if (text) node.textContent = text;
  return node;
}

function readQuery(name) {
  const match = String(globalThis.location?.search || "").match(new RegExp(`[?&]${name}=([^&]*)`));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return "";
  }
}

const REPORT_ENDPOINT = "/api/report";
const AUTO_SEND_DELAY_MS = 2000;
const SESSION_ID = Math.random().toString(36).slice(2, 10);
let autoSendTimer = 0;
let lastSentReport = "";

function setUploadStatus(text) {
  const node = document.getElementById("upload-status");
  if (node) node.textContent = text;
}

// Sends the current report to the project's Vercel logs (redacted server
// side). Unchanged reports are not sent twice.
async function sendReport({ force = false } = {}) {
  const text = document.getElementById("report").textContent || "";
  if (!text || (!force && text === lastSentReport)) return;
  lastSentReport = text;
  setUploadStatus("Envoi du rapport…");
  try {
    const response = await fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: REPORT_SOURCES[0], session: SESSION_ID, text })
    });
    const time = new Date().toLocaleTimeString();
    setUploadStatus(
      response.ok
        ? `Rapport envoyé à ${time} (session ${SESSION_ID})`
        : `Échec de l'envoi (HTTP ${response.status}) à ${time}`
    );
  } catch (error) {
    lastSentReport = "";
    setUploadStatus(`Échec de l'envoi : ${String(error && error.message ? error.message : error)}`);
  }
}

function scheduleAutoSend() {
  clearTimeout(autoSendTimer);
  autoSendTimer = setTimeout(() => void sendReport(), AUTO_SEND_DELAY_MS);
}

function renderReport() {
  const report = buildReport({
    runtime: state.runtime,
    trackApis: state.trackApis,
    media: state.media,
    addon: state.addon,
    playback: state.playback,
    audio: state.tracks.audio,
    text: state.tracks.text,
    keys: state.keys,
    events: state.events
  });
  document.getElementById("report").textContent = report;
  scheduleAutoSend();
}

function pushEvent(name, detail = "") {
  const video = document.getElementById("probe-video");
  state.events.push({
    event: name,
    t: video ? Number(video.currentTime || 0).toFixed(1) : "0",
    readyState: video ? video.readyState : 0,
    detail
  });
  if (state.events.length > MAX_EVENTS) state.events.shift();
}

function refreshTracks() {
  const video = document.getElementById("probe-video");
  state.tracks = listTracks(video);
  renderReport();
}

async function runAddonProbe() {
  const input = document.getElementById("addon-url");
  const url = normalizeProbeUrl(input.value);
  if (!url) {
    state.addon = { status: "invalid url" };
    renderReport();
    return;
  }
  state.addon = { status: "running", url };
  renderReport();
  const started = Date.now();
  try {
    const response = await fetch(url, { method: "GET" });
    const text = await response.text();
    let manifestId = "";
    try {
      manifestId = String(JSON.parse(text).id || "");
    } catch (_) {
      manifestId = "(not JSON)";
    }
    state.addon = {
      status: response.ok ? "ok" : "http error",
      httpStatus: response.status,
      manifestId,
      ms: Date.now() - started,
      url
    };
  } catch (error) {
    // A CORS refusal surfaces here as a TypeError with no status.
    state.addon = {
      status: "blocked or network error",
      error: String(error && error.message ? error.message : error),
      ms: Date.now() - started,
      url
    };
  }
  renderReport();
}

function runPlaybackProbe() {
  const input = document.getElementById("media-url");
  const url = normalizeProbeUrl(input.value);
  const video = document.getElementById("probe-video");
  if (!url) {
    state.playback = { status: "invalid url" };
    renderReport();
    return;
  }
  state.events = [];
  state.playback = { status: "loading", url };
  video.src = url;
  const playPromise = video.play && video.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((error) => {
      pushEvent("play-rejected", String(error && error.name ? error.name : error));
      renderReport();
    });
  }
  renderReport();
}

// Stremio's VidaaVideo shows the first embedded text track, then disables it,
// so the TV publishes the track list. This button reproduces that step.
function runTextTrackBootstrap() {
  const video = document.getElementById("probe-video");
  const tracks = Array.from((video && video.textTracks) || []);
  if (!tracks.length) {
    pushEvent("text-bootstrap", "no text tracks");
    renderReport();
    return;
  }
  tracks[0].mode = "showing";
  setTimeout(() => {
    tracks.forEach((track) => {
      track.mode = "disabled";
    });
    pushEvent("text-bootstrap", `tracks=${tracks.length}`);
    refreshTracks();
  }, 0);
}

function stopPlayback() {
  const video = document.getElementById("probe-video");
  video.removeAttribute("src");
  video.load();
  state.playback = { status: "stopped" };
  renderReport();
}

function bindVideo(video) {
  VIDEO_EVENTS.forEach((name) => {
    video.addEventListener(name, () => {
      let detail = "";
      if (name === "error" && video.error) {
        detail = `code=${video.error.code}`;
        state.playback = { ...state.playback, status: "error", errorCode: video.error.code };
      }
      if (name === "loadedmetadata") {
        state.playback = {
          ...state.playback,
          status: "metadata",
          duration: Number(video.duration || 0).toFixed(1),
          size: `${video.videoWidth}x${video.videoHeight}`
        };
      }
      if (name === "playing") {
        state.playback = { ...state.playback, status: "playing" };
      }
      pushEvent(name, detail);
      refreshTracks();
    });
  });
}

function focusables() {
  return Array.from(document.querySelectorAll("[data-focusable]"));
}

const SCROLL_STEP_PX = 320;

function moveFocus(step) {
  const items = focusables();
  const index = items.indexOf(document.activeElement);
  const action = resolveVerticalKey({ index, count: items.length, step });
  if (action.focus !== undefined) {
    items[action.focus].focus();
    return;
  }
  if (action.scroll < 0 && index < 0 && (globalThis.scrollY || 0) <= SCROLL_STEP_PX) {
    // Back at the top: return to the last control.
    globalThis.scrollTo(0, 0);
    if (items.length) items[items.length - 1].focus();
    return;
  }
  if (document.activeElement && document.activeElement.blur && action.scroll > 0) {
    document.activeElement.blur();
  }
  globalThis.scrollBy(0, action.scroll * SCROLL_STEP_PX);
}

function onKeyDown(event) {
  state.keys.unshift(describeKeyEvent(event));
  if (state.keys.length > MAX_KEYS) state.keys.pop();
  renderReport();
  const code = Number(event.keyCode || 0);
  if (code === 38 || code === 40) {
    event.preventDefault();
    moveFocus(code === 40 ? 1 : -1);
  }
}

function button(id, label, onClick) {
  const node = element("button", { id, "data-focusable": "" }, label);
  node.addEventListener("click", onClick);
  return node;
}

function textInput(id, value, placeholder) {
  const node = element("input", { id, type: "text", "data-focusable": "", placeholder });
  node.value = value;
  return node;
}

function mount() {
  const root = document.getElementById("app");
  root.appendChild(element("h1", {}, "Nuvio · diagnostic VIDAA"));
  root.appendChild(
    element(
      "p",
      {},
      "Haut/Bas pour naviguer (Bas après le dernier bouton fait défiler jusqu'au rapport), OK pour valider. Appuie sur les touches de la télécommande (Retour, lecture…) : elles sont notées dans le rapport."
    )
  );

  root.appendChild(element("h2", {}, "Addon"));
  root.appendChild(textInput("addon-url", readQuery("addon") || DEFAULT_ADDON_URL, "URL manifest"));
  root.appendChild(button("addon-run", "Tester l'addon", runAddonProbe));

  root.appendChild(element("h2", {}, "Lecture"));
  root.appendChild(
    textInput("media-url", readQuery("url"), "Lien vidéo (debrid, mp4, mkv, m3u8…)")
  );
  const actions = element("div", { class: "row" });
  actions.appendChild(button("media-run", "Lire", runPlaybackProbe));
  actions.appendChild(
    button("media-sample", "Vidéo de test MKV", () => {
      document.getElementById("media-url").value = SAMPLE_MKV_URL;
      runPlaybackProbe();
    })
  );
  actions.appendChild(button("media-text", "Amorcer sous-titres", runTextTrackBootstrap));
  actions.appendChild(button("media-tracks", "Relire les pistes", refreshTracks));
  actions.appendChild(button("media-stop", "Stop", stopPlayback));
  root.appendChild(actions);
  const video = element("video", { id: "probe-video", playsinline: "" });
  root.appendChild(video);
  bindVideo(video);

  root.appendChild(element("h2", {}, "Rapport (envoyé automatiquement)"));
  root.appendChild(
    button("report-send", "Envoyer le rapport", () => void sendReport({ force: true }))
  );
  root.appendChild(element("p", { id: "upload-status" }, "Pas encore envoyé"));
  root.appendChild(element("pre", { id: "report" }));

  state.media = probeMediaSupport({
    video: document.createElement("video"),
    mediaSource: globalThis.MediaSource || null
  });
  state.trackApis = describeTrackApis(video);
  document.addEventListener("keydown", onKeyDown, true);
  renderReport();
  // Start on a button: on VIDAA the Back key is Backspace (8), which would
  // otherwise delete a character from a focused text field.
  const first = document.getElementById("addon-run") || focusables()[0];
  if (first) first.focus();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
