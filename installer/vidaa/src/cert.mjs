// Minimal self-signed X.509 certificate generator (no dependencies).
//
// The VIDAA browser only exposes Hisense_installApp() to pages served from
// https://vidaahub.com, so the installer impersonates that host on the LAN.
// The TV shows a certificate warning that the user accepts once; the key pair
// is generated fresh on every run and never leaves this machine.

import { generateKeyPairSync, randomBytes, sign } from "node:crypto";

function derLength(length) {
  if (length < 0x80) return Buffer.from([length]);
  const bytes = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag, ...parts) {
  const content = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

const sequence = (...parts) => tlv(0x30, ...parts);
const set = (...parts) => tlv(0x31, ...parts);
const integer = (buffer) =>
  tlv(0x02, buffer[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buffer]) : buffer);
const utf8 = (text) => tlv(0x0c, Buffer.from(text, "utf8"));
const octetString = (buffer) => tlv(0x04, buffer);
const bitString = (buffer) => tlv(0x03, Buffer.from([0]), buffer);
const explicit = (index, content) => tlv(0xa0 + index, content);
const dnsName = (name) => tlv(0x82, Buffer.from(name, "ascii"));

function oid(dotted) {
  const [first, second, ...rest] = dotted.split(".").map(Number);
  const bytes = [first * 40 + second];
  for (const value of rest) {
    const chunk = [value & 0x7f];
    let remaining = value >> 7;
    while (remaining > 0) {
      chunk.unshift((remaining & 0x7f) | 0x80);
      remaining >>= 7;
    }
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function utcTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const text =
    pad(date.getUTCFullYear() % 100) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z";
  return tlv(0x17, Buffer.from(text, "ascii"));
}

function toPem(label, der) {
  const base64 = der.toString("base64").replace(/.{1,64}/g, "$&\n");
  return `-----BEGIN ${label}-----\n${base64}-----END ${label}-----\n`;
}

export function createSelfSignedCertificate(hostnames) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signatureAlgorithm = sequence(oid("1.2.840.113549.1.1.11"), tlv(0x05)); // sha256WithRSAEncryption
  const name = sequence(set(sequence(oid("2.5.4.3"), utf8(hostnames[0]))));
  const serial = randomBytes(16);
  serial[0] &= 0x7f;

  // Wide validity window: TV clocks are frequently wrong before NTP sync.
  const notBefore = new Date(Date.UTC(2024, 0, 1));
  const notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const extensions = sequence(
    sequence(oid("2.5.29.19"), octetString(sequence())), // basicConstraints: CA=false
    sequence(oid("2.5.29.17"), octetString(sequence(...hostnames.map(dnsName)))), // subjectAltName
    sequence(oid("2.5.29.37"), octetString(sequence(oid("1.3.6.1.5.5.7.3.1")))) // extKeyUsage: serverAuth
  );

  const tbsCertificate = sequence(
    explicit(0, integer(Buffer.from([2]))), // v3
    integer(serial),
    signatureAlgorithm,
    name,
    sequence(utcTime(notBefore), utcTime(notAfter)),
    name,
    publicKey.export({ type: "spki", format: "der" }),
    explicit(3, extensions)
  );

  const signature = sign("sha256", tbsCertificate, privateKey);
  const certificate = sequence(tbsCertificate, signatureAlgorithm, bitString(signature));

  return {
    cert: toPem("CERTIFICATE", certificate),
    key: privateKey.export({ type: "pkcs8", format: "pem" })
  };
}
