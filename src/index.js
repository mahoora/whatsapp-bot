require("dotenv").config();

const express = require("express");
const fs = require("fs");
const https = require("https");
const { startBridge, getSock, isConnected, getLatestQr } = require("./bridge");
const { createDashboard } = require("./admin/dashboard");
const { loadHistory, saveHistory } = require("./message-handler");
const ordersDb = require("./orders-db");

const PORT = process.env.PORT || 3000;
const ADMIN_JID = process.env.ADMIN_JID || "966595510125@s.whatsapp.net";
const RENDER_URL = process.env.RENDER_URL || "https://whatsapp-bridge-8lq2.onrender.com";

let aiDisabledPhones = loadAiDisabled();
const aiMode = { current: "ai" };
const stats = { msgCount: 0, lastError: "", lastFrom: "", lastReply: "", lastBranch: "" };

function loadAiDisabled() {
  try { return JSON.parse(fs.readFileSync("./ai-disabled.json")); }
  catch (e) { return []; }
}

function keepAlive() {
  setInterval(() => {
    https.get(RENDER_URL + "/status", res => { res.resume(); }).on("error", () => {});
    saveHistory();
  }, 240000);
}

const app = express();
app.use(express.json());

app.use("/", createDashboard(getSock, isConnected, getLatestQr, aiDisabledPhones, aiMode, stats, ADMIN_JID));

const sseClients = [];

app.get("/events", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write("data: {\"connected\":false}\n\n");
  sseClients.push(res);
  req.on("close", () => { const i = sseClients.indexOf(res); if(i>=0) sseClients.splice(i,1); });
});

app.get("/status", (req, res) => {
  res.json({
    connected: isConnected(),
    user: getSock()?.user?.id || null,
    msgCount: stats.msgCount,
    aiMode: aiMode.current,
    aiDisabled: aiDisabledPhones.length,
  });
});

app.post("/send", async (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) return res.status(400).json({ error: "Missing fields" });
  try {
    await getSock().sendMessage(to, { text });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/order", (req, res) => {
  const { customerName, customerPhone, items, notes, totalPrice } = req.body;
  if (!customerName || !customerPhone || !items) {
    return res.status(400).json({ error: "Missing fields: customerName, customerPhone, items" });
  }
  const order = ordersDb.createOrder({ customerName, customerPhone, items, notes, totalPrice });
  const summary = `🛒 طلب جديد #${order.id}\nالعميل: ${customerName}\nالهاتف: ${customerPhone}\nالمنتجات: ${items.map(i => i.name).join("، ")}\nالإجمالي: ${totalPrice || "يحتسب"} ريال\nالحالة: قيد المراجعة`;
  getSock()?.sendMessage(ADMIN_JID, { text: summary }).catch(() => {});
  res.json(order);
});

app.get("/orders", (req, res) => {
  res.json(ordersDb.listOrders(req.query.status));
});

app.get("/orders/:id", (req, res) => {
  const order = ordersDb.getOrder(Number(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

app.patch("/orders/:id/status", (req, res) => {
  const { status } = req.body;
  if (!["pending", "confirmed", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const order = ordersDb.setOrderStatus(Number(req.params.id), status);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

app.get("/diag", (req, res) => {
  res.json({
    msgCount: stats.msgCount,
    lastError: stats.lastError,
    lastFrom: stats.lastFrom,
    lastReply: stats.lastReply,
    lastBranch: stats.lastBranch,
    connected: isConnected(),
    aiMode: aiMode.current,
    aiDisabledCount: aiDisabledPhones.length,
    user: getSock()?.user?.id,
  });
});

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of sseClients) try { c.write(msg); } catch(e) { const i = sseClients.indexOf(c); if(i>=0) sseClients.splice(i,1); }
}

app.get("/history", (req, res) => {
  const { conversationHistory } = require("./message-handler");
  const obj = {};
  for (const [key, val] of conversationHistory) obj[key] = val.slice(-10);
  res.json(obj);
});

const { setOnMessage } = require("./message-handler");
setOnMessage((data) => broadcast("message", data));

loadHistory();

app.listen(PORT, () => {
  console.log("Bot server on http://localhost:" + PORT);
  keepAlive();
  startBridge(ADMIN_JID, aiDisabledPhones, aiMode, stats).catch(console.error);
});
