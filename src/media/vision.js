const { analyzeImage } = require("../ai-router");

async function processImage(buffer, mimeType, caption) {
  const base64 = buffer.toString("base64");
  const text = caption || "حلل هذه الصورة وأعطني تفاصيل عنها";
  return await analyzeImage(base64, mimeType, text);
}

module.exports = { processImage };
