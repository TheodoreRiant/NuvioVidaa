// Hisense VIDAA package: a static hosted web app.
//
// VIDAA runs third-party apps as hosted web pages, with no local package format
// and no companion service. This script stages the built app as a static
// folder (.cache/vidaa-package/app) and zips it for deployment to any static
// host. Torrent/P2P and the packaged PluginService are unavailable on VIDAA.
import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import JSZip from "jszip";
import { readAppMetadata } from "./appMetadata.mjs";
import { compatibilityPolicy } from "./compatibilityPolicy.mjs";
import { pruneCssFileForPlatform } from "./pruneCssForPlatform.mjs";
import { VIDAA_PRECACHE_FILES } from "../js/platform/vidaa/vidaaCacheRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const stagingDir = path.join(rootDir, ".cache", "vidaa-package");
const appStageDir = path.join(stagingDir, "app");

const appName = "Nuvio TV";
// webOS-only files that must not ship in the VIDAA bundle.
const WEBOS_ONLY_FILES = ["appinfo.json", path.join("assets", "libs", "webOSTV.js")];

async function assertDistExists() {
  try {
    await access(path.join(distDir, "app.bundle.js"), fsConstants.R_OK);
    await access(path.join(distDir, "css", "bundle.css"), fsConstants.R_OK);
  } catch {
    throw new Error(`Build output not found at ${distDir}. Run "npm run build" first.`);
  }
}

export function buildVidaaIndexHtml() {
  return `<!DOCTYPE html>
<html lang="en" class="no-flex-gap no-css-math no-backdrop-filter no-aspect-ratio">
<head>
  <meta charset="UTF-8" />
  <!-- The app is laid out on a 1920x1080 canvas, like on Samsung. VIDAA
       reports a 1280x720 viewport at 1.5 device pixels per CSS pixel, so the
       scale is left free and the browser fits the canvas to the panel. -->
  <meta name="viewport" content="width=1920, height=1080, user-scalable=no" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${appName}</title>
  <script src="assets/runtime/legacy-features.js"></script>
  <link rel="stylesheet" href="css/bundle.css" />
</head>
<body>
  <div id="nuvio-vidaa-splash" style="position:fixed;inset:0;top:0;left:0;right:0;bottom:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:#0d0d0d;transition:opacity 250ms ease-out;">
    <img src="assets/brand/app_logo_wordmark.png" alt="Nuvio" style="width:30vw;max-width:520px;height:auto;" />
  </div>
  <script>
    // Remote keys would drive the app behind the splash while it still stalls.
    window.__NUVIO_SPLASH_ACTIVE__ = true;
    document.addEventListener("keydown", function swallowKeysUnderSplash(event) {
      if (window.__NUVIO_SPLASH_ACTIVE__) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  </script>
  <script src="boot-guard.js"></script>
  <script src="core-js.bundle.js" onerror="window.NuvioBootGuard &amp;&amp; window.NuvioBootGuard.scriptFailed(this.src)"></script>
  <script>window.__NUVIO_PLATFORM__ = "vidaa";</script>
  <script src="nuvio.env.js"></script>
  <script src="assets/libs/qrcode-generator.js"></script>
  <script>
    window.NuvioBootGuard.runCompatibilityGate({ platform: "vidaa" }, function startNuvioApp() {
      window.NuvioBootGuard.loadScript("app.bundle.js");
    });
    // App-shell cache (sw.js): registered after load so it never delays start.
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function registerNuvioServiceWorker() {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      });
    }
  </script>
</body>
</html>
`;
}

// Standalone on-device diagnostic page: runtime, codecs, track APIs, remote
// keys, addon reachability and a playback probe. It does not load the app.
export function buildVidaaDiagnosticHtml({ scriptSrc = "vidaa-diagnostic.js" } = {}) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName} · diagnostic VIDAA</title>
  <style>
    body { margin: 0; padding: 24px 48px; background: #0e0f12; color: #f2f2f2; font: 22px/1.4 sans-serif; }
    h1 { font-size: 34px; margin: 0 0 8px; }
    h2 { font-size: 26px; margin: 24px 0 8px; }
    input { width: 80%; font-size: 22px; padding: 8px; }
    button { font-size: 22px; padding: 8px 16px; margin: 8px 8px 0 0; }
    input:focus, button:focus { outline: 4px solid #4da3ff; }
    video { display: block; width: 640px; height: 360px; margin-top: 12px; background: #000; }
    pre { white-space: pre-wrap; font-size: 18px; background: #1b1d22; padding: 12px; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script src="${scriptSrc}"></script>
</body>
</html>
`;
}

async function buildDiagnosticBundle() {
  await build({
    entryPoints: [path.join(rootDir, "js", "platform", "vidaa", "vidaaDiagnosticPage.js")],
    outfile: path.join(appStageDir, "vidaa-diagnostic.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: [`chrome${compatibilityPolicy.chromiumVersion}`],
    minify: true,
    legalComments: "none"
  });
  await writeFile(
    path.join(appStageDir, "vidaa-diagnostic.html"),
    buildVidaaDiagnosticHtml(),
    "utf8"
  );
  // Short address to type with the remote: <host>/d/
  await mkdir(path.join(appStageDir, "d"), { recursive: true });
  await writeFile(
    path.join(appStageDir, "d", "index.html"),
    buildVidaaDiagnosticHtml({ scriptSrc: "/vidaa-diagnostic.js" }),
    "utf8"
  );
}

// Cache version: changes whenever any precached file changes, so each deploy
// installs a fresh cache and the worker deletes the previous one.
export function computeCacheVersion(buffers) {
  const hash = createHash("sha256");
  buffers.forEach((buffer) => hash.update(buffer));
  return hash.digest("hex").slice(0, 16);
}

export async function buildVidaaServiceWorker({ version }) {
  const result = await build({
    entryPoints: [path.join(rootDir, "js", "platform", "vidaa", "vidaaServiceWorker.js")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: [`chrome${compatibilityPolicy.chromiumVersion}`],
    minify: false,
    legalComments: "none",
    define: { __VIDAA_CACHE_NAME__: JSON.stringify(`nuvio-vidaa-${version}`) }
  });
  return result.outputFiles[0].text;
}

async function writeServiceWorker() {
  const buffers = await Promise.all(
    VIDAA_PRECACHE_FILES.map((file) => readFile(path.join(appStageDir, file)))
  );
  const version = computeCacheVersion(buffers);
  await writeFile(
    path.join(appStageDir, "sw.js"),
    await buildVidaaServiceWorker({ version }),
    "utf8"
  );
  console.log(`VIDAA service worker cache version ${version}`);
}

async function stageApp() {
  await rm(stagingDir, { recursive: true, force: true });
  await cp(distDir, appStageDir, { recursive: true });
  await Promise.all(
    WEBOS_ONLY_FILES.map((file) => rm(path.join(appStageDir, file), { force: true }))
  );
  await pruneCssFileForPlatform(path.join(appStageDir, "css", "bundle.css"), "vidaa");
  await cp(path.join(rootDir, "assets", "images", "icon.png"), path.join(appStageDir, "icon.png"));
  await writeFile(path.join(appStageDir, "index.html"), buildVidaaIndexHtml(), "utf8");
  await buildDiagnosticBundle();
  await writeServiceWorker();
}

async function addDirectoryToZip(zip, directory, prefix = "") {
  const entries = await readdir(directory);
  entries.sort();
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry);
    const zipPath = prefix ? `${prefix}/${entry}` : entry;
    if ((await stat(absolutePath)).isDirectory()) {
      await addDirectoryToZip(zip, absolutePath, zipPath);
    } else {
      zip.file(zipPath, await readFile(absolutePath));
    }
  }
}

async function packageVidaa() {
  await assertDistExists();
  const { version } = await readAppMetadata();

  console.log("staging VIDAA app...");
  await stageApp();

  console.log("creating VIDAA zip...");
  const zip = new JSZip();
  await addDirectoryToZip(zip, appStageDir);
  const outputPath = path.join(rootDir, `nuvio-vidaa_${version}.zip`);
  const content = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });
  await writeFile(outputPath, content);
  console.log(`VIDAA static app staged in ${appStageDir}`);
  console.log(`VIDAA package created: ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await packageVidaa();
  } catch (error) {
    console.error("\nVIDAA packaging failed:");
    console.error(error);
    process.exit(1);
  }
}
