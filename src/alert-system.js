const { CATEGORY_KEYWORDS } = require("./config/catalog");

const ALERTED_PHONES = new Set();

function checkForEmergency(text) {
  const lower = text.trim();
  return CATEGORY_KEYWORDS.emergency.some(kw => lower.includes(kw));
}

async function handleEmergency(sock, jid, text, adminJid) {
  const phone = jid.split("@")[0].replace(/[^0-9]/g, "");
  if (ALERTED_PHONES.has(jid)) return false;
  ALERTED_PHONES.add(jid);
  setTimeout(() => ALERTED_PHONES.delete(jid), 600000);

  const alertMsg = [
    "🚨 تنبيه طوارئ 🚨",
    `من: ${phone}`,
    `الرسالة: ${text.substring(0, 200)}`,
    "",
    `رابط الاتصال: https://wa.me/${phone}`,
  ].join("\n");

  try {
    await sock.sendMessage(adminJid, { text: alertMsg });
  } catch (e) {
    console.error("Alert send failed:", e.message);
  }
  return true;
}

module.exports = { checkForEmergency, handleEmergency };
