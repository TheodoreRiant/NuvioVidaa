// POST /api/report: receives a VIDAA diagnostic report and writes it, redacted,
// as one line to the Vercel runtime logs. Nothing is stored or readable back
// over HTTP; only the project owner sees the logs.
import {
  MAX_BODY_CHARS,
  REPORT_LOG_PREFIX,
  sanitizeReport
} from "../js/platform/vidaa/vidaaReport.js";

function parseBody(body) {
  if (body && typeof body === "object") return body;
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body);
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("");
  }
  const rawBody = req.body;
  const rawLength =
    typeof rawBody === "string" ? rawBody.length : JSON.stringify(rawBody || "").length;
  if (rawLength > MAX_BODY_CHARS) {
    return res.status(413).send("");
  }
  const result = sanitizeReport(parseBody(rawBody));
  if (!result.ok) {
    return res.status(400).send("");
  }
  console.log(
    `${REPORT_LOG_PREFIX} ${JSON.stringify({ ...result.report, at: new Date().toISOString() })}`
  );
  return res.status(204).send("");
}
