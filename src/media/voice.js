const https = require("https");
const FormData = require("form-data");

function transcribeAudio(audioBuffer) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", audioBuffer, { filename: "audio.ogg", contentType: "audio/ogg" });
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "ar");
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return resolve("");
    const opts = {
      hostname: "api.groq.com",
      path: "/openai/v1/audio/transcriptions",
      method: "POST",
      timeout: 30000,
      headers: form.getHeaders({ Authorization: "Bearer " + apiKey }),
    };
    const req = https.request(opts, res => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => {
        try { const j = JSON.parse(b); resolve(j.text || ""); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    form.pipe(req);
  });
}

module.exports = { transcribeAudio };
