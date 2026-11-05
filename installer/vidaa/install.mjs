#!/usr/bin/env node
// Nuvio TV - VIDAA installer.
//
// VIDAA (Hisense) has no public sideload tool. The only documented way to add a
// custom app is the vidaahub.com install hook the TV browser exposes. This
// script stands up a tiny local DNS + HTTPS endpoint that impersonates
// vidaahub.com on your LAN and serves a one-button page. On the TV you point DNS
// at this computer, open https://vidaahub.com/, and press Install; the TV then
// registers Nuvio TV as a launcher entry pointing at the hosted web build.
//
// Nothing is installed on this computer and no network setting is changed
// permanently: you revert the TV's DNS after installing.
//
// Usage:
//   node installer/vidaa/install.mjs [--app-url <url>] [--ip <lan-ip>]
//                                    [--upstream <dns>] [--owner <o>] [--repo <r>]

import { createSelfSignedCertificate } from "./src/cert.mjs";
import { startDnsServer } from "./src/dns.mjs";
import { startWebServers } from "./src/server.mjs";
import { renderInstallerPage } from "./src/page.mjs";
import { detectLanAddress, defaultAppUrl } from "./src/network.mjs";

const HIJACK_HOSTS = ["vidaahub.com"];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const owner = args.owner || "TheodoreRiant";
  const repo = args.repo || "NuvioVidaa";
  const upstream = args.upstream || "1.1.1.1";

  const lanAddress = detectLanAddress(typeof args.ip === "string" ? args.ip : undefined);
  if (!lanAddress) {
    log("Could not determine a LAN IPv4 address. Pass one with --ip <address>.");
    process.exit(1);
  }

  const appUrl =
    typeof args["app-url"] === "string" ? args["app-url"] : defaultAppUrl({ owner, repo });
  const iconUrl = `${appUrl.replace(/\/?$/, "/")}assets/brand/app_logo_mark.png`;
  const page = renderInstallerPage({
    appId: "nuviotv",
    appName: "Nuvio TV",
    appUrl,
    iconUrl
  });

  const { cert, key } = createSelfSignedCertificate(["vidaahub.com", "*.vidaahub.com"]);

  let dns;
  let web;
  try {
    dns = await startDnsServer({
      listenAddress: "0.0.0.0",
      answerAddress: lanAddress,
      hosts: HIJACK_HOSTS,
      upstream,
      onLog: log
    });
    web = await startWebServers({
      listenAddress: "0.0.0.0",
      page,
      cert,
      key,
      httpPort: 80,
      httpsPort: 443,
      onLog: log
    });
  } catch (error) {
    if (error && error.code === "EACCES") {
      log("");
      log("Permission denied binding ports 53/80/443 (privileged ports).");
      log("Re-run with elevated rights:  sudo node installer/vidaa/install.mjs");
      log("On Windows, run the terminal as Administrator.");
    } else if (error && error.code === "EADDRINUSE") {
      log("");
      log("A port (53, 80 or 443) is already in use. Stop the conflicting service");
      log("(another DNS/web server) and try again.");
    } else {
      log(`Failed to start: ${error && error.message ? error.message : error}`);
    }
    if (dns) dns.close();
    if (web) web.close();
    process.exit(1);
  }

  log("");
  log("========================================================================");
  log("  Nuvio TV - VIDAA installer is running");
  log("========================================================================");
  log(`  Web build URL : ${appUrl}`);
  log(`  This computer : ${lanAddress}`);
  log("");
  log("  On your TV:");
  log("   1. Settings > Network > set DNS (manual) to this computer's IP:");
  log(`        ${lanAddress}`);
  log("   2. Open the TV browser and go to:  https://vidaahub.com/");
  log("        (accept the one-time certificate warning)");
  log('   3. Press "Install Nuvio TV".');
  log("   4. Set the TV's DNS back to automatic, then restart the TV.");
  log("");
  log("  Keep this window open until the install finishes. Press Ctrl+C to stop.");
  log("========================================================================");

  const shutdown = () => {
    log("\nShutting down installer...");
    if (dns) dns.close();
    if (web) web.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
