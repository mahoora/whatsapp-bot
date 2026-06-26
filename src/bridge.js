const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const path = require("path");
const fs = require("fs");
const { handleMessage } = require("./message-handler");

const AUTH_DIR = process.env.AUTH_DIR || "./auth_info";

let logger = pino({ level: "warn" });

function saveCredsToEnv() {
  const p = path.join(AUTH_DIR, "creds.json");
  if (!fs.existsSync(p)) return;
  try {
    const https = require("https");
    const apiKey = process.env.RENDER_API_KEY;
    const sid = process.env.RENDER_SERVICE_ID;
    const value = fs.readFileSync(p).toString("base64");
    if (!apiKey || !sid) return;
    const body = JSON.stringify({ value });
    const opts = {
      hostname: "api.render.com",
      path: "/v1/services/" + sid + "/env-vars/CREDS_JSON",
      method: "PUT",
      timeout: 10000,
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    };
    const req = https.request(opts, res => { res.resume(); });
    req.on("error", () => {});
    req.write(body);
    req.end();
  } catch (e) {}
}

function loadCreds() {
  const v = process.env.CREDS_JSON;
  if (!v) return;
  try {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(path.join(AUTH_DIR, "creds.json"), Buffer.from(v, "base64"));
    console.log("Loaded creds from env");
  } catch (e) {
    console.error("Failed to load creds:", e.message);
  }
}

loadCreds();

let sock = null;
let wsConnected = false;
let latestQr = null;
let restartTimer = null;
let starting = false;

async function startBridge(adminJid, aiDisabledPhones, aiMode, stats, broadcast) {
  if (starting) return;
  starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      logger,
      browser: ["Chrome", "Chrome", "120.0"],
    });

    sock.ev.on("creds.update", () => { saveCreds(); saveCredsToEnv(); });

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        latestQr = qr;
        qrcode.generate(qr, { small: true });
        console.log("QR generated for WhatsApp pairing");
        if (broadcast) broadcast("connected", { qr: true });
      }
      if (connection === "open") {
        wsConnected = true;
        starting = false;
        console.log("WhatsApp connected! " + (sock.user?.id || ""));
      }
      if (connection === "close") {
        wsConnected = false;
        latestQr = null;
        starting = false;
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log("Disconnected. Reason: " + (lastDisconnect?.error?.message || "unknown") + " (code: " + reason + ")");
        if (reason !== DisconnectReason.loggedOut && !restartTimer) {
          restartTimer = setTimeout(() => {
            restartTimer = null;
            startBridge(adminJid, aiDisabledPhones, aiMode, stats, broadcast);
          }, 10000);
        }
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
    console.error("startBridge error:", e.message);
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

module.exports = { startBridge, getSock, isConnected, getLatestQr, restartBridge };
