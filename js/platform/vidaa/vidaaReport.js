// Diagnostic report upload for VIDAA: shared by the TV page (which sends the
// report) and api/report.js (which writes it to the Vercel runtime logs).
// Reports are redacted before they are logged, so debrid keys carried in
// addon or stream URLs never reach the logs.

export const MAX_REPORT_CHARS = 64 * 1024;
export const MAX_BODY_CHARS = 256 * 1024;
export const REPORT_LOG_PREFIX = "[vidaa-report]";
export const REPORT_SOURCES = Object.freeze(["diagnostic", "app"]);

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SECRET_QUERY_PATTERN =
  /([?&](?:api[_-]?key|apikey|key|token|access[_-]?token|auth|password|secret)=)[^&#\s]*/gi;
// Stremio addon configs carried in the path, e.g. /torbox=KEY/ or /realdebrid=KEY/.
const SECRET_PATH_PATTERN =
  /(\/(?:torbox|realdebrid|real-debrid|alldebrid|premiumize|debridlink|debrid-link|offcloud|putio|easydebrid|apikey|api_key|token)=)[^/?#\s|]+/gi;

export function redactSecrets(text) {
  return String(text)
    .replace(UUID_PATTERN, "***")
    .replace(SECRET_QUERY_PATTERN, "$1***")
    .replace(SECRET_PATH_PATTERN, "$1***");
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
