const fs = require("fs");
const path = require("path");
const os = require("os");

async function extractTextFromPDF(buffer) {
  try {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (e) {
    console.error("PDF parse error:", e.message);
    return "";
  }
}

async function saveAndReadPDF(buffer) {
  const tmpPath = path.join(os.tmpdir(), "whatsapp-pdf-" + Date.now() + ".pdf");
  try {
    fs.writeFileSync(tmpPath, buffer);
    const text = await extractTextFromPDF(buffer);
    return text;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (e) {}
  }
}

module.exports = { extractTextFromPDF, saveAndReadPDF };
