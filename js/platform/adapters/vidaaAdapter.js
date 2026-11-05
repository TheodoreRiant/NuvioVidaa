import { normalizeKeyEvent, isBackEvent } from "../sharedKeys.js";

// Hisense VIDAA runs the app as a plain hosted web page: there is no native
// media API, no companion service and no app-exit bridge. Playback uses the
// HTML5 <video> element (plus hls.js / dash.js where MSE is available), and
// the remote's Back key is reported as Backspace (8).
const VIDAA_BACK_KEY_CODES = [461, 10009, 27, 8];

export const vidaaAdapter = {
  name: "vidaa",

  init() {
    const documentRef = globalThis.document;
    documentRef?.documentElement?.classList?.add("vidaa-tv");
    documentRef?.body?.classList?.add("vidaa-tv");
  },

  exitApp() {
    try {
      globalThis.close?.();
    } catch (_) {
      // Ignore runtimes that refuse window.close().
    }
  },

  isBackEvent(event) {
    return isBackEvent(event, VIDAA_BACK_KEY_CODES);
  },

  normalizeKey(event) {
    return normalizeKeyEvent(event, VIDAA_BACK_KEY_CODES);
  },

  getDeviceLabel() {
    return "VIDAA TV";
  },

  getCapabilities() {
    return {
      hlsJs: Boolean(globalThis.Hls?.isSupported?.()),
      dashJs: Boolean(globalThis.dashjs?.MediaPlayer),
      nativeVideo: true,
      webosAvplay: false,
      tizenAvplay: false
    };
  },

  prepareVideoElement() {}
};
