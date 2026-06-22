function calculateDelay(text) {
  const base = 1000;
  const perChar = 30;
  const max = 6000;
  const delay = Math.min(base + (text.length * perChar), max);
  const jitter = Math.random() * 1000;
  return delay + jitter;
}

async function simulateTyping(sock, jid, text) {
  const delay = calculateDelay(text);
  await sock.sendPresenceUpdate("composing", jid);
  await new Promise(r => setTimeout(r, delay));
}

module.exports = { simulateTyping, calculateDelay };
