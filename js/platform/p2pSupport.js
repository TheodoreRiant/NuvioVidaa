import { Platform } from "./index.js";
import { TizenCapabilities } from "./tizen/tizenCapabilities.js";

// True when this TV can never play torrent/P2P streams: Samsung Tizen 4.x
// (no EngineFS service) and Hisense VIDAA (hosted web app, no local service).
export function isP2pUnsupportedOnThisTv() {
  return Platform.isVidaa() || TizenCapabilities.isP2pUnsupported();
}
