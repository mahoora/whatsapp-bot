if (typeof globalThis.crypto === "undefined" || !globalThis.crypto?.getRandomValues) {
  try { globalThis.crypto = require("crypto").webcrypto; } catch (e) { console.error("crypto polyfill failed:", e.message); }
}

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const path = require("path");
const fs = require("fs");
const { handleMessage } = require("./message-handler");

const AUTH_DIR = process.env.AUTH_DIR || "./auth_info";

let logger = pino({ level: "warn" });

// Delete corrupted creds from env (was causing 405 errors)
// Auth will be created fresh by Baileys on first connection
const oldCredsPath = path.join(AUTH_DIR, "creds.json");
try {
  if (fs.existsSync(oldCredsPath)) {
    const content = fs.readFileSync(oldCredsPath, "utf8");
    // If creds file starts with '{' it's a valid JSON, keep it
    JSON.parse(content);
  }
} catch(e) {
  // Corrupted creds - delete them
  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    console.log("Deleted corrupted auth directory");
  } catch(e2) {}
}

let sock = null;
let wsConnected = false;
let latestQr = null;
let restartTimer = null;
let starting = false;
let bridgeAttempts = 0;
let lastConnEvent = null;

async function startBridge(adminJid, aiDisabledPhones, aiMode, stats, broadcast) {
  if (starting) return;
  starting = true;
  bridgeAttempts++;
  const attempt = bridgeAttempts;
  console.log(`Bridge attempt #${attempt}...`);
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Bridge #${attempt}: using WA version ${version.join(".")} (latest: ${isLatest})`);

    sock = makeWASocket({
      version,
      printQRInTerminal: true,
      auth: state,
      logger,
      browser: ["Chrome", "Chrome", "120.0"],
    });
    console.log(`Bridge #${attempt}: socket created`);

    sock.ev.on("creds.update", () => { saveCreds(); saveCredsToEnv(); });

    sock.ev.on("connection.update", (update) => {
      lastConnEvent = update;
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        latestQr = qr;
        qrcode.generate(qr, { small: true });
        console.log(`Bridge #${attempt}: QR generated`);
        if (broadcast) broadcast("connected", { qr: true });
      }
      if (connection === "open") {
        wsConnected = true;
        starting = false;
        console.log(`Bridge #${attempt}: WhatsApp connected! ` + (sock.user?.id || ""));
        if (broadcast) broadcast("connected", { connected: true });
      }
      if (connection === "close") {
        wsConnected = false;
        latestQr = null;
        starting = false;
        const reason = lastDisconnect?.error?.output?.statusCode;
        const msg = lastDisconnect?.error?.message || "unknown";
        console.log(`Bridge #${attempt}: disconnected. Reason: ${msg} (code: ${reason})`);
        stats.lastError = "DISCONNECT: " + msg + " (code: " + reason + ")";
        if (reason !== DisconnectReason.loggedOut && !restartTimer) {
          console.log(`Bridge #${attempt}: will reconnect in 10s`);
          restartTimer = setTimeout(() => {
            restartTimer = null;
            startBridge(adminJid, aiDisabledPhones, aiMode, stats, broadcast);
          }, 10000);
        }
      }
      if (connection === "connecting") {
        console.log(`Bridge #${attempt}: connecting...`);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      await new Promise(r => setTimeout(r, 2000));
      for (const msg of messages) {
        try {
          await handleMessage(sock, msg, adminJid, aiDisabledPhones, aiMode, stats);
        } catch (e) {
          stats.lastError = "FATAL: " + e.message;
          console.error("FATAL:", e.message);
        }
      }
    });

    return sock;
  } catch (e) {
    console.error(`Bridge #${attempt}: error:`, e.message);
    stats.lastError = "BRIDGE_ERR: " + e.message;
    starting = false;
    setTimeout(() => {
      startBridge(adminJid, aiDisabledPhones, aiMode, stats, broadcast);
    }, 15000);
  }
}

function getSock() { return sock; }
function isConnected() { return wsConnected; }
function getLatestQr() { return latestQr; }
async function restartBridge(adminJid, aiDisabledPhones, aiMode, stats, broadcast) {
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  if (sock) {
    try { sock.end(); } catch(e) {}
    try { sock.ws?.close(); } catch(e) {}
    sock = null;
  }
  wsConnected = false;
  latestQr = null;
  starting = false;
  try {
    const dir = path.join(AUTH_DIR);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log("Auth directory cleared");
    }
  } catch(e) { console.error("Failed to clear auth dir:", e.message); }
  return startBridge(adminJid, aiDisabledPhones, aiMode, stats, broadcast);
}

function getBridgeInfo() {
  return {
    attempts: bridgeAttempts,
    connected: wsConnected,
    hasQr: !!latestQr,
    lastConnEvent: lastConnEvent ? { connection: lastConnEvent.connection, hasQr: !!lastConnEvent.qr, disconnectReason: lastConnEvent.lastDisconnect?.error?.message } : null,
    starting,
  };
}

module.exports = { startBridge, getSock, isConnected, getLatestQr, restartBridge, getBridgeInfo };
