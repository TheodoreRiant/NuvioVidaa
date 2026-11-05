// Diagnostic report upload for VIDAA: shared by the TV page (which sends the
// report) and api/report.js (which writes it to the Vercel runtime logs).
// Reports are redacted before they are logged: every URL is collapsed to its
// scheme, host and file extension, because addon and stream URLs carry debrid
// keys in many shapes (TorBox UUIDs, Real-Debrid/AllDebrid/Premiumize keys,
// Torrentio "|" configs, base64 configs, userinfo) and no list of key formats
// can be complete. The diagnosis only needs the host and the container type.

export const MAX_REPORT_CHARS = 16 * 1024;
export const MAX_BODY_CHARS = 32 * 1024;
export const REPORT_LOG_PREFIX = "[vidaa-report]";
export const REPORT_SOURCES = Object.freeze(["diagnostic", "app"]);

const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function collapseUrl(url) {
  const schemeEnd = url.indexOf("://") + 3;
  const rest = url.slice(schemeEnd);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  const tail = authorityEnd === -1 ? "" : rest.slice(authorityEnd);
  const base = `${url.slice(0, schemeEnd)}${host}`;
  const path = tail.split(/[?#]/)[0];
  if (!tail) return base;
  if (path === "/" && tail === "/") return `${base}/`;
  const lastSegment = path.split("/").filter(Boolean).pop() || "";
  const extension = lastSegment.match(/\.([a-z0-9]{2,5})$/i);
  return `${base}/…${extension ? extension[1].toLowerCase() : ""}`;
}

export function redactSecrets(text) {
  return String(text).replace(URL_PATTERN, collapseUrl).replace(UUID_PATTERN, "***");
}

function cleanSession(value) {
  return String(value || "")
    .replace(/[^a-z0-9-]/gi, "")
    .slice(0, 32);
}

export function sanitizeReport(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "invalid body" };
  }
  if (!REPORT_SOURCES.includes(payload.source)) {
    return { ok: false, error: "invalid source" };
  }
  if (typeof payload.text !== "string" || !payload.text.trim()) {
    return { ok: false, error: "invalid text" };
  }
  let text = redactSecrets(payload.text);
  if (text.length > MAX_REPORT_CHARS) {
    text = `${text.slice(0, MAX_REPORT_CHARS)}\n[truncated]`;
  }
  return {
    ok: true,
    report: { source: payload.source, session: cleanSession(payload.session), text }
  };
}
