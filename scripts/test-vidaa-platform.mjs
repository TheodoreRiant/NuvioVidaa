// Hisense VIDAA platform detection, remote keys, and P2P gating.
import assert from "node:assert/strict";

const VIDAA_UA =
  "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/94.0.4606.81 Safari/537.36 VIDAA/7.0(Hisense;SmartTV;55A6K;MTK9612/V0000.07.12K.N1123)";
const HISENSE_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 11; Hisense Google TV) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/112.0.0.0 Safari/537.36";

function setRuntime({ userAgent = "", search = "", platformOverride } = {}) {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent },
    configurable: true,
    writable: true
  });
  globalThis.location = { search, href: `https://app.example/${search}` };
  if (platformOverride === undefined) {
    delete globalThis.__NUVIO_PLATFORM__;
  } else {
    globalThis.__NUVIO_PLATFORM__ = platformOverride;
  }
}

const { Platform } = await import("../js/platform/index.js");
const { isP2pUnsupportedOnThisTv } = await import("../js/platform/p2pSupport.js");
const { getTvRuntimePerformanceProfile } = await import("../js/platform/tvRuntimePerformance.js");

function detect(runtime) {
  setRuntime(runtime);
  Platform.current = null;
  return Platform.getName();
}

// 1. Detection: packaged override, wrapper query, and the VIDAA user agent.
assert.equal(detect({ platformOverride: "vidaa" }), "vidaa");
assert.equal(detect({ search: "?wrapper=vidaa" }), "vidaa");
assert.equal(detect({ userAgent: VIDAA_UA }), "vidaa");
assert.equal(Platform.isVidaa(), true);
assert.equal(Platform.isBrowser(), false);
assert.equal(Platform.isTizen(), false);
assert.equal(Platform.isWebOS(), false);
assert.equal(Platform.getDeviceLabel(), "VIDAA TV");

// 2. Hisense Android/Google TV models are not VIDAA.
assert.equal(detect({ userAgent: HISENSE_ANDROID_UA }), "browser");
// Existing platforms are unchanged.
assert.equal(detect({ platformOverride: "tizen" }), "tizen");
assert.equal(detect({ platformOverride: "webos" }), "webos");

// 3. Remote keys: Backspace (8) is Back on VIDAA; arrows and OK pass through.
detect({ userAgent: VIDAA_UA });
assert.equal(Platform.isBackEvent({ keyCode: 8 }), true);
assert.equal(Platform.isBackEvent({ keyCode: 13 }), false);
assert.equal(Platform.normalizeKey({ keyCode: 37, key: "ArrowLeft" }).keyCode, 37);
assert.equal(Platform.normalizeKey({ keyCode: 13, key: "Enter" }).keyCode, 13);

// 4. Capabilities: no native AVPlay on VIDAA.
const capabilities = Platform.getCapabilities();
assert.equal(capabilities.nativeVideo, true);
assert.equal(capabilities.tizenAvplay, false);
assert.equal(capabilities.webosAvplay, false);

// 5. Torrent/P2P is reported as unsupported on VIDAA, not on a desktop browser.
assert.equal(isP2pUnsupportedOnThisTv(), true);
const { TizenStreamingServerResolver } =
  await import("../js/core/p2p/tizenStreamingServerResolver.js");
const torrentStream = { infoHash: "0123456789abcdef0123456789abcdef01234567" };
assert.equal(TizenStreamingServerResolver.isUnsupportedOnCurrentTizen(torrentStream), true);
assert.equal(
  TizenStreamingServerResolver.isUnsupportedOnCurrentTizen({ url: "https://cdn.example/a.mp4" }),
  false
);
assert.equal(TizenStreamingServerResolver.canResolveStream(torrentStream), false);
detect({ userAgent: HISENSE_ANDROID_UA });
assert.equal(isP2pUnsupportedOnThisTv(), false);
assert.equal(TizenStreamingServerResolver.isUnsupportedOnCurrentTizen(torrentStream), false);

// 6. Runtime profile: VIDAA is a TV runtime, sized by its Chromium version.
detect({ userAgent: VIDAA_UA });
const profile = getTvRuntimePerformanceProfile({ forceRefresh: true });
assert.equal(profile.isTvRuntime, true);
assert.equal(profile.platform, "vidaa");
assert.equal(profile.chromiumMajorVersion, 94);
assert.equal(profile.isLegacyTvRuntime, false);

detect({ userAgent: VIDAA_UA.replace("Chrome/94.0.4606.81", "Chrome/72.0.3626.105") });
assert.equal(getTvRuntimePerformanceProfile({ forceRefresh: true }).isLegacyTvRuntime, true);

console.log("VIDAA platform detection, keys, P2P gating and runtime profile passed.");
