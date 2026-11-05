// Small DNS responder used only on the local network during installation.
//
// It answers queries for vidaahub.com with this computer's LAN IP so the TV's
// browser loads the installer page, and forwards every other name to a normal
// upstream resolver so the TV's other traffic is unaffected. It runs only while
// the installer is open and changes nothing permanently on the network.

import dgram from "node:dgram";

const TYPE_A = 1;
const CLASS_IN = 1;
const FORWARD_TIMEOUT_MS = 4000;

function parseQuestion(packet) {
  if (packet.length < 12) return null;
  if (packet.readUInt16BE(4) < 1) return null;
  const labels = [];
  let offset = 12;
  while (offset < packet.length) {
    const len = packet[offset];
    if (len === 0) break;
    if (len & 0xc0) return null;
    labels.push(packet.toString("ascii", offset + 1, offset + 1 + len));
    offset += 1 + len;
  }
  const nameEnd = offset + 1;
  if (nameEnd + 4 > packet.length) return null;
  return {
    name: labels.join(".").toLowerCase(),
    type: packet.readUInt16BE(nameEnd),
    qclass: packet.readUInt16BE(nameEnd + 2),
    questionEnd: nameEnd + 4
  };
}

function ipv4ToBytes(address) {
  return Buffer.from(address.split(".").map((part) => Number(part) & 0xff));
}

function buildAnswer(query, question, address) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(query.readUInt16BE(0), 0);
  header.writeUInt16BE(0x8180, 2); // response, recursion available
  header.writeUInt16BE(1, 4); // one question
  const isA = question.type === TYPE_A && question.qclass === CLASS_IN;
  header.writeUInt16BE(isA ? 1 : 0, 6); // answer count
  const questionSection = query.subarray(12, question.questionEnd);
  if (!isA) return Buffer.concat([header, questionSection]);

  const record = Buffer.alloc(16);
  record.writeUInt16BE(0xc00c, 0); // pointer to the question name
  record.writeUInt16BE(TYPE_A, 2);
  record.writeUInt16BE(CLASS_IN, 4);
  record.writeUInt32BE(60, 6); // TTL
  record.writeUInt16BE(4, 10); // RDLENGTH
  ipv4ToBytes(address).copy(record, 12);
  return Buffer.concat([header, questionSection, record]);
}

function matchesHijack(name, hosts) {
  return hosts.some((host) => name === host || name.endsWith(`.${host}`));
}

export function startDnsServer({
  listenAddress,
  answerAddress,
  hosts,
  upstream,
  port = 53,
  onLog
}) {
  const socket = dgram.createSocket("udp4");
  const log = typeof onLog === "function" ? onLog : () => {};

  socket.on("message", (message, remote) => {
    const question = parseQuestion(message);

    if (question && matchesHijack(question.name, hosts)) {
      socket.send(buildAnswer(message, question, answerAddress), remote.port, remote.address);
      log(`dns: ${question.name} -> ${answerAddress}`);
      return;
    }

    // Forward anything else to the real resolver and relay the reply back.
    const forwarder = dgram.createSocket("udp4");
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        forwarder.close();
      } catch {
        // socket already closed
      }
    };
    const timer = setTimeout(finish, FORWARD_TIMEOUT_MS);
    forwarder.on("message", (reply) => {
      socket.send(reply, remote.port, remote.address);
      finish();
    });
    forwarder.on("error", finish);
    forwarder.send(message, 53, upstream, (error) => {
      if (error) finish();
    });
  });

  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, listenAddress, () => {
      socket.removeListener("error", reject);
      socket.on("error", (error) => log(`dns error: ${error.message}`));
      log(`DNS server listening on ${listenAddress}:${port} (upstream ${upstream})`);
      resolve({ close: () => socket.close() });
    });
  });
}
