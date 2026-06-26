const { SYSTEM_PROMPT } = require("./config/system-prompt");

let lastError = "";
let keyIndex = 0;
let mistralKeyIndex = 0;

const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);
const MISTRAL_KEYS = (process.env.MISTRAL_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";

async function fetchWithTimeout(url, options, timeout = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function callGroq(systemPrompt, messages, retries = 1) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const msgs = [{ role: "system", content: systemPrompt }, ...messages];
  try {
    const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: msgs, temperature: 0.7, max_tokens: 1024 }),
    }, 30000);
    if (res.status === 429 && retries > 0) {
      const wait = retries === 1 ? 30000 : 60000;
      await new Promise(r => setTimeout(r, wait));
      return callGroq(systemPrompt, messages, retries - 1);
    }
    if (res.status !== 200) { lastError = "GROQ HTTP " + res.status; return null; }
    const j = await res.json();
    lastError = "";
    return j.choices?.[0]?.message?.content || "";
  } catch (e) { lastError = "GROQ_ERR: " + e.message; return null; }
}

async function callGemini(systemPrompt, messages) {
  if (GEMINI_KEYS.length === 0) return null;
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const idx = (keyIndex + i) % GEMINI_KEYS.length;
    const apiKey = GEMINI_KEYS[idx];
    const contents = messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    try {
      const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        }),
      }, 20000);
      if (res.status === 200) {
        keyIndex = (idx + 1) % GEMINI_KEYS.length;
        const j = await res.json();
        lastError = "";
        return j.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
      if (res.status === 429) { lastError = "GEMINI 429 key" + (idx + 1); continue; }
      lastError = "GEMINI HTTP " + res.status;
      return null;
    } catch (e) { lastError = "GEMINI_ERR: " + e.message; return null; }
  }
  return null;
}

async function callGeminiVision(systemPrompt, imageBase64, mimeType, text) {
  if (GEMINI_KEYS.length === 0) return null;
  const apiKey = GEMINI_KEYS[0];
  const parts = [{ text: systemPrompt + "\n\n" + text }];
  parts.push({ inlineData: { mimeType, data: imageBase64 } });
  try {
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      }),
    }, 30000);
    if (res.status === 200) {
      const j = await res.json();
      return j.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
    return null;
  } catch (e) { return null; }
}

async function callCloudflare(systemPrompt, messages) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null;
  const msgs = [{ role: "system", content: systemPrompt }, ...messages];
  try {
    const res = await fetchWithTimeout(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: "Bearer " + CF_API_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", messages: msgs, temperature: 0.7, max_tokens: 1024 }),
    }, 25000);
    if (res.status === 200) { const j = await res.json(); lastError = ""; return j.choices?.[0]?.message?.content || ""; }
    if (res.status === 429) { lastError = "CF 429"; return null; }
    lastError = "CF HTTP " + res.status;
    return null;
  } catch (e) { lastError = "CF_ERR: " + e.message; return null; }
}

async function callMistral(systemPrompt, messages) {
  if (MISTRAL_KEYS.length === 0) return null;
  for (let i = 0; i < MISTRAL_KEYS.length; i++) {
    const idx = (mistralKeyIndex + i) % MISTRAL_KEYS.length;
    const apiKey = MISTRAL_KEYS[idx];
    const msgs = [{ role: "system", content: systemPrompt }, ...messages];
    try {
      const res = await fetchWithTimeout("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "open-mistral-nemo", messages: msgs, temperature: 0.7, max_tokens: 1024 }),
      }, 25000);
      if (res.status === 200) {
        mistralKeyIndex = (idx + 1) % MISTRAL_KEYS.length;
        const j = await res.json();
        lastError = "";
        return j.choices?.[0]?.message?.content || "";
      }
      if (res.status === 429) { lastError = "MISTRAL 429"; continue; }
      lastError = "MISTRAL HTTP " + res.status;
      return null;
    } catch (e) { lastError = "MISTRAL_ERR: " + e.message; return null; }
  }
  return null;
}

async function getAIResponse(messages, context = "") {
  const fullPrompt = SYSTEM_PROMPT + (context ? "\n" + context : "");
  let reply = await callGemini(fullPrompt, messages);
  if (reply) return { text: reply, provider: "gemini" };
  reply = await callCloudflare(fullPrompt, messages);
  if (reply) return { text: reply, provider: "cloudflare" };
  reply = await callGroq(fullPrompt, messages);
  if (reply) return { text: reply, provider: "groq" };
  reply = await callMistral(fullPrompt, messages);
  if (reply) return { text: reply, provider: "mistral" };
  return { text: "آسف، حصل مشكلة فنية. كلم المهندس ماهر البدري على الخاص.", provider: "none" };
}

async function analyzeImage(imageBase64, mimeType, text) {
  return await callGeminiVision(SYSTEM_PROMPT, imageBase64, mimeType, text);
}

function getLastError() { return lastError; }

module.exports = { getAIResponse, analyzeImage, getLastError };
