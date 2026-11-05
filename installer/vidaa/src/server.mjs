// HTTP (port 80) and HTTPS (port 443) servers that serve the installer page for
// vidaahub.com. HTTPS is required because the VIDAA browser exposes the Hisense
// install APIs only on a secure vidaahub.com origin. Any path returns the page.

import http from "node:http";
import https from "node:https";

function handler(page) {
  return (req, res) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(page);
  };
}

function listen(server, port, address, label, log) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, address, () => {
      server.removeListener("error", reject);
      server.on("error", (error) => log(`${label} error: ${error.message}`));
      log(`${label} server listening on ${address}:${port}`);
      resolve({ close: () => server.close() });
    });
  });
}

export async function startWebServers({
  listenAddress,
  page,
  cert,
  key,
  httpPort,
  httpsPort,
  onLog
}) {
  const log = typeof onLog === "function" ? onLog : () => {};
  const closers = [];

  const httpServer = http.createServer(handler(page));
  closers.push(await listen(httpServer, httpPort, listenAddress, "HTTP", log));

  const httpsServer = https.createServer({ cert, key }, handler(page));
  closers.push(await listen(httpsServer, httpsPort, listenAddress, "HTTPS", log));

  return { close: () => closers.forEach((closer) => closer.close()) };
}
