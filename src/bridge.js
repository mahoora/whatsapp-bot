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
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(path.join(AUTH_DIR, "creds.json"), Buffer.from(v, "base64"));
}

loadCreds();

let sock = null;
let wsConnected = false;
let latestQr = null;
let restartTimer = null;

async function startBridge(adminJid, aiDisabledPhones, aiMode, stats, broadcast) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Chrome", "Chrome", "120.0"],
  });

  sock.ev.on("creds.update", () => { saveCreds(); saveCredsToEnv(); });

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      latestQr = qr;
      qrcode.generate(qr, { small: true });
      if (broadcast) broadcast("connected", { qr: true });
    }
    if (connection === "open") {
      wsConnected = true;
      console.log("WhatsApp connected! " + (sock.user?.id || ""));
    }
    if (connection === "close") {
      wsConnected = false;
      console.log("Disconnected. Reason: " + (lastDisconnect?.error?.message || "unknown"));
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut && !restartTimer) {
        restartTimer = setTimeout(() => {
          restartTimer = null;
          startBridge(adminJid, aiDisabledPhones, aiMode, stats);
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
}

function getSock() { return sock; }
function isConnected() { return wsConnected; }
function getLatestQr() { return latestQr; }

module.exports = { startBridge, getSock, isConnected, getLatestQr };
