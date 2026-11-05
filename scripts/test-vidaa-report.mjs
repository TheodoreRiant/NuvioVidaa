// VIDAA diagnostic report upload: redaction, validation and the /api/report
// function that writes reports to the Vercel runtime logs.
import assert from "node:assert/strict";

const { redactSecrets, sanitizeReport, MAX_REPORT_CHARS, REPORT_LOG_PREFIX } =
  await import("../js/platform/vidaa/vidaaReport.js");
const { default: handler } = await import("../api/report.js");

// 1. Debrid keys never reach the logs: UUID-shaped segments (TorBox, Torrentio
//    configs) and key/token query values are masked; the rest stays readable.
{
  const key = "00000000-1111-4222-8333-444444444444";
  const text = `playback.url: https://torrentio.strem.fun/resolve/torbox/${key}/9940acdbc1db4ae18650836112b12c8a490465de/Show.S01E05.mkv/4/Show.S01E05.mkv`;
  const redacted = redactSecrets(text);
  assert.doesNotMatch(redacted, new RegExp(key));
  assert.match(redacted, /\/resolve\/torbox\/\*\*\*\//);
  assert.match(redacted, /9940acdbc1db4ae18650836112b12c8a490465de/, "info hashes stay readable");
  assert.match(redacted, /Show\.S01E05\.mkv/);
}
assert.equal(
  redactSecrets("https://a.example/x?apikey=SECRET1&token=SECRET2&name=ok&api_key=S3&password=p"),
  "https://a.example/x?apikey=***&token=***&name=ok&api_key=***&password=***"
);
assert.equal(
  redactSecrets("https://addon.example/torbox=abcDEF123456/realdebrid=XYZ987/manifest.json"),
  "https://addon.example/torbox=***/realdebrid=***/manifest.json"
);
assert.equal(redactSecrets("runtime.worker: true"), "runtime.worker: true");

// 2. Only well-formed reports are accepted, and they are bounded.
{
  const ok = sanitizeReport({
    source: "diagnostic",
    session: "abc123",
    text: "runtime.worker: true"
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.report, {
    source: "diagnostic",
    session: "abc123",
    text: "runtime.worker: true"
  });
}
assert.equal(sanitizeReport(null).ok, false);
assert.equal(sanitizeReport("text").ok, false);
assert.equal(sanitizeReport({ source: "other", text: "x" }).ok, false);
assert.equal(sanitizeReport({ source: "diagnostic", text: 42 }).ok, false);
assert.equal(sanitizeReport({ source: "diagnostic", text: "" }).ok, false);
{
  const long = sanitizeReport({ source: "app", text: "a".repeat(MAX_REPORT_CHARS + 50) });
  assert.equal(long.ok, true);
  assert.equal(long.report.text.length <= MAX_REPORT_CHARS + "\n[truncated]".length, true);
  assert.match(long.report.text, /\[truncated\]$/);
}
{
  const session = sanitizeReport({
    source: "app",
    session: "<script>!!" + "z".repeat(80),
    text: "x"
  });
  assert.match(session.report.session, /^[a-z0-9-]{0,32}$/i);
}
{
  const redacted = sanitizeReport({
    source: "diagnostic",
    text: "u: https://x.example/resolve/torbox/00000000-1111-4222-8333-444444444444/f.mkv"
  });
  assert.doesNotMatch(redacted.report.text, /00000000-1111/);
}

// 3. The function accepts POSTed JSON, logs one prefixed line, answers 204,
//    and rejects other methods and malformed bodies without logging.
function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    send(body = "") {
      this.body = body;
      return this;
    },
    end(body = "") {
      this.body = body;
      return this;
    }
  };
}

async function call(req) {
  const logged = [];
  const original = console.log;
  console.log = (...args) => logged.push(args.join(" "));
  const res = fakeResponse();
  try {
    await handler(req, res);
  } finally {
    console.log = original;
  }
  return { res, logged };
}

{
  const { res, logged } = await call({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { source: "diagnostic", session: "s1", text: "media.mkv: native=no" }
  });
  assert.equal(res.statusCode, 204);
  assert.equal(logged.length, 1);
  assert.ok(logged[0].startsWith(REPORT_LOG_PREFIX));
  const entry = JSON.parse(logged[0].slice(REPORT_LOG_PREFIX.length).trim());
  assert.equal(entry.source, "diagnostic");
  assert.equal(entry.text, "media.mkv: native=no");
  assert.equal(res.headers["cache-control"], "no-store");
}
{
  // Some runtimes hand the body over as a string (text/plain beacons).
  const { res, logged } = await call({
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ source: "app", text: "ok" })
  });
  assert.equal(res.statusCode, 204);
  assert.equal(logged.length, 1);
}
{
  const { res, logged } = await call({ method: "GET", headers: {}, body: undefined });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "POST");
  assert.equal(logged.length, 0);
}
{
  const { res, logged } = await call({ method: "POST", headers: {}, body: "not json" });
  assert.equal(res.statusCode, 400);
  assert.equal(logged.length, 0);
}
{
  const { res, logged } = await call({
    method: "POST",
    headers: {},
    body: { source: "diagnostic", text: "x".repeat(300000) }
  });
  assert.equal(res.statusCode, 413);
  assert.equal(logged.length, 0);
}

console.log("VIDAA report upload passed (redaction, validation, /api/report).");
