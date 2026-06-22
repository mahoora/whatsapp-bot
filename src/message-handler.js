const { CATEGORY_KEYWORDS, CATEGORY_RESPONSES, RENTAL_LIST_TEXT, BUSINESS_INFO } = require("./config/catalog");
const { getFamilyContext, getFamilyByPhone } = require("./config/family");
const { getAIResponse } = require("./ai-router");
const { simulateTyping } = require("./humanizer");
const { checkForEmergency, handleEmergency } = require("./alert-system");
const { processImage } = require("./media/vision");
const { transcribeAudio } = require("./media/voice");
const { saveAndReadPDF } = require("./media/pdf");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const MAX_HISTORY = 30;
const conversationHistory = new Map();

function loadHistory() {
  try {
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync("./conversation-history.json"));
    for (const [key, val] of Object.entries(data)) {
      conversationHistory.set(key, val);
    }
  } catch (e) {}
}

function saveHistory() {
  try {
    const fs = require("fs");
    const obj = {};
    for (const [key, val] of conversationHistory) obj[key] = val;
    fs.writeFileSync("./conversation-history.json", JSON.stringify(obj));
    const base64 = Buffer.from(JSON.stringify(obj)).toString("base64");
    try {
      const https = require("https");
      const apiKey = process.env.RENDER_API_KEY;
      const sid = process.env.RENDER_SERVICE_ID;
      if (apiKey && sid) {
        const body = JSON.stringify({ value: base64 });
        const opts = {
          hostname: "api.render.com",
          path: "/v1/services/" + sid + "/env-vars/HISTORY_JSON",
          method: "PUT",
          timeout: 5000,
          headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        };
        const req = https.request(opts, res => { res.resume(); });
        req.on("error", () => {});
        req.write(body);
        req.end();
      }
    } catch (e) {}
  } catch (e) {}
}

function getReply(text) {
  const lower = text.trim();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === "emergency") continue;
    if (keywords.some(kw => lower.includes(kw))) {
      if (CATEGORY_RESPONSES[category]) return CATEGORY_RESPONSES[category];
    }
  }
  return null;
}

async function handleMessage(sock, msg, adminJid, aiDisabledPhones, aiMode, stats) {
  if (!msg.key || msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  if (jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter")) return;

  let text = msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || "";

  const sender = msg.pushName || "Unknown";
  const senderPhone = jid.split("@")[0].replace(/[^0-9]/g, "");

  if (aiDisabledPhones.some(p => senderPhone.includes(p) || jid.includes(p))) return;

  stats.msgCount++;
  stats.lastFrom = jid;

  if (!conversationHistory.has(jid)) conversationHistory.set(jid, []);
  const history = conversationHistory.get(jid);

  const audioMsg = msg.message?.audioMessage;
  if (audioMsg && !text) {
    try {
      const buffer = await downloadMediaMessage(msg, "buffer", {});
      text = await transcribeAudio(buffer);
      stats.lastBranch = "VOICE";
    } catch (e) {
      console.error("Voice error:", e.message);
      return;
    }
  }

  const imageMsg = msg.message?.imageMessage;
  if (imageMsg) {
    try {
      const buffer = await downloadMediaMessage(msg, "buffer", {});
      const analysis = await processImage(buffer, imageMsg.mimetype, text);
      if (analysis) text = text + "\n[تحليل الصورة: " + analysis + "]";
      stats.lastBranch = "IMAGE_AI";
    } catch (e) {
      console.error("Image error:", e.message);
    }
  }

  const docMsg = msg.message?.documentMessage;
  if (docMsg && (docMsg.mimetype === "application/pdf" || docMsg.fileName?.endsWith(".pdf"))) {
    try {
      const buffer = await downloadMediaMessage(msg, "buffer", {});
      const pdfText = await saveAndReadPDF(buffer);
      if (pdfText) text = text + "\n[محتوى PDF: " + pdfText.substring(0, 2000) + "]";
      stats.lastBranch = "PDF_READ";
    } catch (e) {
      console.error("PDF error:", e.message);
    }
  }

  if (!text) return;

  history.push({ role: "user", content: text });
  if (history.length > MAX_HISTORY) history.shift();
  saveHistory();

  const lower = text.trim();
  if (lower === "يدوي" || lower === "يدي") {
    aiMode.current = "manual";
    stats.lastBranch = "CMD_MANUAL";
    await simulateTyping(sock, jid, "تم");
    await sock.readMessages([msg.key]).catch(() => {});
    await sock.sendMessage(jid, { text: "✅ تم التحويل إلى الرد اليدوي. أنت هترد بنفسك." });
    return;
  }
  if (lower === "تلقائي" || lower === "زكاء") {
    aiMode.current = "ai";
    stats.lastBranch = "CMD_AI";
    await simulateTyping(sock, jid, "تم");
    await sock.readMessages([msg.key]).catch(() => {});
    await sock.sendMessage(jid, { text: "✅ تم التشغيل. الزكاء هيرد على الرسايل." });
    return;
  }
  if (lower === "قائمة" || lower === "اعدادات" || lower === "menu") {
    const st = aiMode.current === "ai" ? "تلقائي (الزكاء)" : "يدوي";
    stats.lastBranch = "CMD_MENU";
    await simulateTyping(sock, jid, "القائمة");
    await sock.readMessages([msg.key]).catch(() => {});
    await sock.sendMessage(jid, { text: "الوضع الحالي: " + st + "\nأرسل:\nيدوي → رد يدوي\nتلقائي → رد الزكاء\nالغاء الرقم → منع الزكاء عن رقم" });
    return;
  }
  if (lower.startsWith("الغاء ") || lower.startsWith("إلغاء ") || lower.startsWith("منع ")) {
    const num = lower.split(" ")[1];
    if (num && num.length >= 9) {
      if (!aiDisabledPhones.includes(num)) aiDisabledPhones.push(num);
      await simulateTyping(sock, jid, "تم المنع");
      await sock.readMessages([msg.key]).catch(() => {});
      await sock.sendMessage(jid, { text: "✅ تم إيقاف الزكاء عن الرقم " + num });
      const fs = require("fs");
      fs.writeFileSync("./ai-disabled.json", JSON.stringify(aiDisabledPhones));
    } else {
      await simulateTyping(sock, jid, "أكتب الرقم");
      await sock.readMessages([msg.key]).catch(() => {});
      await sock.sendMessage(jid, { text: "أكتب الرقم كامل، مثال: الغاء 201093122475" });
    }
    return;
  }
  if (lower.startsWith("تفعيل ") || lower.startsWith("تشغيل ")) {
    const num = lower.split(" ")[1];
    if (num) {
      const idx = aiDisabledPhones.indexOf(num);
      if (idx >= 0) aiDisabledPhones.splice(idx, 1);
      await simulateTyping(sock, jid, "تم التفعيل");
      await sock.readMessages([msg.key]).catch(() => {});
      await sock.sendMessage(jid, { text: "✅ تم تفعيل الزكاء للرقم " + num });
      const fs = require("fs");
      fs.writeFileSync("./ai-disabled.json", JSON.stringify(aiDisabledPhones));
    }
    return;
  }

  if (aiMode.current === "manual") return;

  const hasPushName = msg.pushName && sender !== "Unknown" && sender.trim() !== "";
  const categoryReply = getReply(text);

  if (!hasPushName && history.length <= 1 && !categoryReply) {
    const eqList = "مرحبًا بك في " + BUSINESS_INFO.shop + "\n📍 " + BUSINESS_INFO.address + "\n\n" + RENTAL_LIST_TEXT + "\n\nللطلب أو الاستفسار: كلم المهندس " + BUSINESS_INFO.name;
    stats.lastBranch = "NEW_CUSTOMER";
    stats.lastReply = "NEW CUSTOMER: sent equipment list";
    await simulateTyping(sock, jid, eqList);
    await sock.readMessages([msg.key]).catch(() => {});
    await sock.sendMessage(jid, { text: eqList }).catch(() => {});
    history.push({ role: "assistant", content: eqList });
    if (history.length > MAX_HISTORY) history.shift();
    saveHistory();
    try { await sock.sendMessage(adminJid, { text: eqList }); } catch (e) {}
    return;
  }

  if (categoryReply) {
    stats.lastBranch = "CATEGORY_AUTO";
    stats.lastReply = categoryReply.substring(0, 100);
    await simulateTyping(sock, jid, categoryReply);
    await sock.readMessages([msg.key]).catch(() => {});
    await sock.sendMessage(jid, { text: categoryReply }).catch(() => {});
    history.push({ role: "assistant", content: categoryReply });
    if (history.length > MAX_HISTORY) history.shift();
    saveHistory();
    return;
  }

  if (checkForEmergency(text)) {
    stats.lastBranch = "EMERGENCY";
    stats.lastReply = "🚨 ALERT SENT";
    await handleEmergency(sock, jid, text, adminJid);
    await simulateTyping(sock, jid, "تم التبليغ");
    await sock.sendMessage(jid, { text: "🔴 تم استلام بلاغك. المهندس ماهر هيواصل معاك في أسرع وقت إن شاء الله." }).catch(() => {});
    return;
  }

  const familyContext = getFamilyContext(jid, sender);
  const h = history.slice(-10, -1);
  const msgs = h.map(m => ({ role: m.role, content: m.content }));
  msgs.push({ role: "user", content: familyContext ? (familyContext + "\n" + text) : text });

  stats.lastBranch = "AI_CALL";
  const result = await getAIResponse(msgs, familyContext);
  const replyText = result.text;
  stats.lastReply = replyText.substring(0, 100);

  await simulateTyping(sock, jid, replyText);
  await sock.readMessages([msg.key]).catch(() => {});
  await sock.sendMessage(jid, { text: replyText }).catch(() => {});

  history.push({ role: "assistant", content: replyText });
  if (history.length > MAX_HISTORY) history.shift();
  saveHistory();

  if (audioMsg && !getFamilyByPhone(jid)) {
    try {
      const url = "https://translate.google.com/translate_tts?ie=UTF-8&q=" + encodeURIComponent(replyText.substring(0, 200)) + "&tl=ar&client=tw-ob";
      const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length > 500) await sock.sendMessage(jid, { audio: buf, mimetype: "audio/mpeg" });
      }
    } catch (e) {
      console.error("TTS error:", e.message);
    }
  }
}

module.exports = { handleMessage, conversationHistory, loadHistory, saveHistory };
