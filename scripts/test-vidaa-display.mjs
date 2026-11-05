// VIDAA display: the app is designed on a 1920x1080 canvas (like Samsung),
// but the VIDAA browser reports a 1280x720 viewport at 1.5 device pixels per
// CSS pixel, so the UI rendered 1.5x too large. The page asks for a 1920-wide
// layout and lets the browser scale it to the panel. The QR sign-in screen
// also showed one sentence twice and an untranslated expiry key.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { buildVidaaIndexHtml } = await import("./package-vidaa.mjs");
const { describeViewport } = await import("../js/platform/vidaa/vidaaStartupReport.js");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// 1. The VIDAA page lays out at 1920x1080 and does not pin the scale to 1,
//    otherwise a 1280-wide panel shows only the top-left part of the canvas.
{
  const html = buildVidaaIndexHtml();
  const meta = html.match(/<meta name="viewport" content="([^"]*)"/);
  assert.ok(meta, "viewport meta present");
  const content = meta[1];
  assert.match(content, /width=1920/);
  assert.match(content, /height=1080/);
  assert.doesNotMatch(content, /device-width/);
  assert.doesNotMatch(content, /initial-scale/);
  assert.ok(
    html.indexOf('name="viewport"') < html.indexOf("css/bundle.css"),
    "viewport set before the stylesheet"
  );
}

// 2. The startup report says which canvas the TV really used, so the fix can
//    be confirmed on the device.
assert.equal(
  describeViewport({ innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1 }),
  "1920x1080@1"
);
assert.equal(
  describeViewport({ innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1.5 }),
  "1280x720@1.5"
);
assert.equal(describeViewport({}), "0x0@0");

// 3. Every translation key the QR screen uses resolves to an Android string.
{
  const i18n = read("js/i18n/index.js");
  const strings = read("res/values/strings.xml");
  const aliasOf = (key) => {
    const match = i18n.match(new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]+)"`));
    return match ? match[1] : null;
  };
  const screenFiles = [
    "js/ui/screens/account/authQrSignInScreenMethods-01-mount.js",
    "js/ui/screens/account/authQrSignInScreenMethods-02-bind-controls.js",
    "js/ui/screens/account/authQrSignInScreenMethods-03-to-friendly-email-error.js"
  ];
  const keys = new Set();
  screenFiles.forEach((file) => {
    for (const match of read(file).matchAll(/I18n\.t\("(auth\.qr\.[A-Za-z.]+)"/g)) {
      keys.add(match[1]);
    }
  });
  assert.ok(keys.has("auth.qr.expires"));
  keys.forEach((key) => {
    const alias = aliasOf(key);
    assert.ok(alias, `${key} has an alias`);
    assert.ok(strings.includes(`name="${alias}"`), `${key} -> ${alias} exists`);
  });

  // 4. The card subtitle already says what the instruction line said (both
  //    keys point to the same string), so the screen shows it only once.
  assert.equal(aliasOf("auth.qr.cardSubtitleSignedOut"), aliasOf("auth.qr.scanInstruction"));
  assert.equal(aliasOf("auth.qr.cardSubtitleSignedIn"), aliasOf("auth.qr.syncedData"));
  assert.doesNotMatch(read(screenFiles[0]), /qr-login-instruction/);
}

console.log("VIDAA display passed (1920 canvas, viewport report, QR texts).");
