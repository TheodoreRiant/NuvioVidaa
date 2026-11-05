// Helpers for picking the LAN address to advertise and discovering the hosted
// web build URL from the latest GitHub release / Pages site.

import os from "node:os";

export function detectLanAddress(preferred) {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) candidates.push(entry.address);
    }
  }
  if (preferred && candidates.includes(preferred)) return preferred;
  // Prefer common private ranges over e.g. VPN or container addresses.
  const privateMatch = candidates.find(
    (ip) =>
      ip.startsWith("192.168.") || ip.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
  return privateMatch || candidates[0] || null;
}

export function defaultAppUrl({ owner, repo }) {
  // The release workflow publishes dist/ to GitHub Pages at this location.
  return `https://${owner.toLowerCase()}.github.io/${repo}/`;
}
