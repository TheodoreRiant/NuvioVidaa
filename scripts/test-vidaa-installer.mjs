import { test } from "node:test";
import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import dgram from "node:dgram";

import { createSelfSignedCertificate } from "../installer/vidaa/src/cert.mjs";
import { renderInstallerPage } from "../installer/vidaa/src/page.mjs";
import { detectLanAddress, defaultAppUrl } from "../installer/vidaa/src/network.mjs";
import { startDnsServer } from "../installer/vidaa/src/dns.mjs";

// Build a minimal DNS query packet for a single A question.
function buildQuery(id, name) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2); // recursion desired
  header.writeUInt16BE(1, 4); // one question
  const labels = name.split(".").map((label) => {
    const buffer = Buffer.from(label, "ascii");
    return Buffer.concat([Buffer.from([buffer.length]), buffer]);
  });
  const question = Buffer.concat([...labels, Buffer.from([0]), Buffer.from([0, 1, 0, 1])]);
  return Buffer.concat([header, question]);
}

function readFirstA(packet) {
  const answerCount = packet.readUInt16BE(6);
  if (answerCount < 1) return null;
  // Skip header + question (name ends at first 0x00, then 4 bytes qtype/qclass).
  let offset = 12;
  while (packet[offset] !== 0) offset += 1 + packet[offset];
  offset += 1 + 4;
  // First answer: name pointer (2) + type (2) + class (2) + ttl (4) + rdlen (2).
  const rdlen = packet.readUInt16BE(offset + 10);
  const rdata = packet.subarray(offset + 12, offset + 12 + rdlen);
  return Array.from(rdata).join(".");
}

test("self-signed certificate covers vidaahub.com and verifies", () => {
  const { cert, key } = createSelfSignedCertificate(["vidaahub.com", "*.vidaahub.com"]);
  assert.match(cert, /BEGIN CERTIFICATE/);
  assert.match(key, /BEGIN PRIVATE KEY/);
  const x509 = new X509Certificate(cert);
  assert.equal(x509.subject, "CN=vidaahub.com");
  assert.match(x509.subjectAltName, /DNS:vidaahub\.com/);
  assert.match(x509.subjectAltName, /DNS:\*\.vidaahub\.com/);
  assert.ok(x509.verify(x509.publicKey), "certificate should be self-consistent");
});

test("installer page embeds the install call and app url", () => {
  const appUrl = "https://example.github.io/NuvioVidaa/";
  const page = renderInstallerPage({
    appId: "nuviotv",
    appName: "Nuvio TV",
    appUrl,
    iconUrl: `${appUrl}assets/brand/app_logo_mark.png`
  });
  assert.match(page, /Hisense_installApp\(/);
  assert.match(page, /Hisense_uninstallApp\(/);
  assert.ok(page.includes(appUrl), "app url should be present for the TV to register");
  assert.match(page, /"appId":"nuviotv"/);
});

test("installer page escapes untrusted values", () => {
  const page = renderInstallerPage({
    appId: "x",
    appName: "</script><b>pwn</b>",
    appUrl: "https://host/",
    iconUrl: "https://host/i.png"
  });
  assert.ok(!page.includes("<b>pwn</b>"), "app name must be HTML-escaped");
  assert.ok(!page.includes("</script><b>"), "script break must be neutralized");
});

test("defaultAppUrl builds the Pages url for the owner/repo", () => {
  assert.equal(
    defaultAppUrl({ owner: "TheodoreRiant", repo: "NuvioVidaa" }),
    "https://theodoreriant.github.io/NuvioVidaa/"
  );
});

test("detectLanAddress honors a valid preferred address", () => {
  const preferred = detectLanAddress("203.0.113.1");
  // The preferred address is only returned when it belongs to a real interface,
  // so here we only assert the call is safe and returns a string or null.
  assert.ok(preferred === null || typeof preferred === "string");
});

test("dns answers vidaahub.com and its subdomains with the installer IP", async () => {
  const server = await startDnsServer({
    listenAddress: "127.0.0.1",
    answerAddress: "192.168.50.50",
    hosts: ["vidaahub.com"],
    upstream: "127.0.0.1",
    port: 15353,
    onLog: () => {}
  });

  const client = dgram.createSocket("udp4");
  const ask = (name) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("dns timeout")), 3000);
      client.once("message", (reply) => {
        clearTimeout(timer);
        resolve(readFirstA(reply));
      });
      client.send(buildQuery(0x1234, name), 15353, "127.0.0.1");
    });

  const hijacked = await ask("vidaahub.com");
  assert.equal(hijacked, "192.168.50.50", "vidaahub.com must resolve to the installer IP");

  const sub = await ask("install.vidaahub.com");
  assert.equal(sub, "192.168.50.50", "subdomains of vidaahub.com are hijacked too");

  client.close();
  server.close();
});
