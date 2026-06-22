const express = require("express");
const QRCode = require("qrcode");
const fs = require("fs");

function createDashboard(getSock, isConnected, getLatestQr, aiDisabledPhones, aiMode, stats, adminJid) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.redirect("/admin");
  });

  router.get("/admin", (req, res) => {
    const mode = aiMode.current === "ai" ? "🤖" : "🖐";
    const modeText = aiMode.current === "ai" ? "رد الزكاء" : "رد يدوي";
    const connected = isConnected();
    const disabledList = aiDisabledPhones.map(p =>
      `<li>${p} <a href="/admin/enable/${encodeURIComponent(p)}" style="color:#4caf50;text-decoration:none">【تفعيل】</a></li>`
    ).join("");

    let convRows = "";
    const { conversationHistory } = require("../message-handler");
    for (const [jid] of conversationHistory) {
      const phone = jid.split("@")[0].replace(/[^0-9]/g, "");
      const isOff = aiDisabledPhones.some(p => phone.includes(p) || jid.includes(p));
      convRows += `<tr><td style="padding:6px 0">${phone}</td>
        <td><a href="/admin/disable/${encodeURIComponent(phone)}" class="btn btn-red" style="padding:4px 10px;font-size:12px">${isOff ? "🔇" : "🔊"}</a></td></tr>`;
    }

    res.send(`<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="utf-8">
<title>تحكم البوت - ماهر البدري</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:sans-serif;background:linear-gradient(135deg,#0b141a,#15222b);color:#eee;padding:20px;max-width:500px;margin:auto;min-height:100vh}
h1{text-align:center;color:#00a884;font-size:22px;margin-bottom:20px}
.card{background:rgba(32,44,51,0.6);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:16px;margin:12px 0}
.card h2{font-size:16px;color:#e9edef;margin-bottom:8px}
.status-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-left:6px}
.dot-on{background:#4caf50;box-shadow:0 0 8px #4caf5066}
.dot-off{background:#e94560;box-shadow:0 0 8px #e9456066}
.btn{display:inline-block;padding:10px 20px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:bold;border:none;cursor:pointer;transition:0.2s}
.btn-green{background:#00a884;color:#fff}
.btn-red{background:#e94560;color:#fff}
.btn-gray{background:#555;color:#fff;opacity:0.6}
.btn-sm{font-size:12px;padding:6px 12px}
input{padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(42,57,66,0.6);color:#e9edef;font-size:14px;width:100%;outline:none;margin:4px 0}
input:focus{border-color:#00a884}
form{display:flex;gap:8px;margin:8px 0}
table{width:100%;font-size:13px;border-collapse:collapse}
td{padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.fab{position:fixed;bottom:16px;left:0;right:0;display:flex;justify-content:center;gap:0;padding:0 16px;z-index:99}
.fab-btn{flex:1;max-width:180px;display:flex;align-items:center;justify-content:center;gap:6px;padding:14px 0;color:#fff;font-size:14px;font-weight:bold;text-decoration:none;transition:0.2s;box-shadow:0 -2px 10px rgba(0,0,0,0.3)}
.fab-btn:active{opacity:0.8}
.fab-left{border-radius:30px 0 0 30px;background:#4caf50}
.fab-right{border-radius:0 30px 30px 0;background:#e94560}
.fab-inactive{background:#555;opacity:0.5}
.qr-img{display:block;margin:12px auto;border-radius:12px;max-width:250px}
.footer{text-align:center;margin-top:30px;padding-bottom:80px}
.footer a{color:#8696a0;font-size:12px}
.badge{display:inline-block;background:rgba(0,168,132,0.15);color:#00a884;padding:2px 10px;border-radius:20px;font-size:12px;margin:2px}
.stats{display:flex;gap:8px;flex-wrap:wrap}
.stat-box{flex:1;min-width:80px;background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;text-align:center}
.stat-box .num{font-size:20px;font-weight:bold;color:#00a884}
.stat-box .label{font-size:11px;color:#8696a0;margin-top:4px}
</style>
</head>
<body>
<h1>🔧 ماهر البدري</h1>

<div class="card" style="text-align:center">
  <span class="status-dot ${connected ? "dot-on" : "dot-off"}"></span>
  ${connected ? "✅ متصل بالواتساب" : "❌ غير متصل"}
  <span style="margin:0 8px">|</span>
  ${mode} ${modeText}
</div>

<div class="card">
  <div class="stats">
    <div class="stat-box"><div class="num">${stats.msgCount}</div><div class="label">رسائل</div></div>
    <div class="stat-box"><div class="num">${conversationHistory.size}</div><div class="label">محادثات</div></div>
    <div class="stat-box"><div class="num">${aiDisabledPhones.length}</div><div class="label">ممنوعين</div></div>
  </div>
</div>

<div class="card">
  <h2>🔇 إيقاف الزكاء عن رقم</h2>
  <form action="/admin/disable" method="get">
    <input name="num" placeholder="آخر 9 أرقام" required>
    <button type="submit" class="btn btn-red btn-sm">🔇 إيقاف</button>
  </form>
</div>

${!connected ? `<div class="card" style="text-align:center" id="qrCard">
  <h2>📱 امسح QR</h2>
  <p style="font-size:12px;color:#8696a0;margin-bottom:8px">افتح واتساب ← الأجهزة المرتبطة ← امسح</p>
  <div id="qrWrap">${getLatestQr() ? `<img src="/admin/qr.png" class="qr-img" alt="QR">` : `<p style="color:#888;font-size:13px" id="qrWait">جاري التوليد...</p>`}</div>
</div>` : ""}

<div class="card">
  <h2>💬 المحادثات (${conversationHistory.size})</h2>
  <table>${convRows || '<tr><td style="color:#888;text-align:center">لا يوجد</td></tr>'}</table>
</div>

<div class="card">
  <h2>📋 جهات الاتصال</h2>
  <div id="contactsList" style="font-size:13px">جاري التحميل...</div>
</div>

<div class="card">
  <h2>ℹ️ معلومات</h2>
  <p style="font-size:12px;color:#8696a0">آخر خطأ: ${stats.lastError || "لا يوجد"}</p>
  <p style="font-size:12px;color:#8696a0">آخر فرع: ${stats.lastBranch || "-"}</p>
  <p style="margin-top:8px"><button id="soundBtn" onclick="toggleSound()" style="background:none;border:1px solid #555;color:#eee;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:14px">🔔</button> صوت الإشعارات</p>
</div>

<div class="fab">
  <a href="/admin/mode/ai" class="fab-btn fab-left ${aiMode.current === "ai" ? "" : "fab-inactive"}">🤖 تلقائي</a>
  <a href="/admin/mode/manual" class="fab-btn fab-right ${aiMode.current === "manual" ? "" : "fab-inactive"}">🖐 يدوي</a>
</div>

<div class="footer"><a href="/admin">تحديث الصفحة</a></div>
<script>
var evtSource = new EventSource("/events");
evtSource.addEventListener("message", function(e) {
  try {
    var d = JSON.parse(e.data);
    if (d && d.from) beep();
  } catch(x) {}
});
evtSource.addEventListener("connected", function(e) {
  if (document.getElementById("qrWait") && e.data) {
    document.getElementById("qrWait").outerHTML = '<img src="/admin/qr.png?' + Date.now() + '" class="qr-img" alt="QR">';
  }
});
let soundOn = true;
try { soundOn = localStorage.getItem("notif_sound") !== "off"; } catch(e) {}
function beep() {
  if (!soundOn) return;
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    for(let f of [800,1000]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      o.start(ctx.currentTime + (f===800?0:0.15)); o.stop(ctx.currentTime + (f===800?0.25:0.4));
    }
  } catch(e) {}
}
function toggleSound() {
  soundOn = !soundOn;
  try { localStorage.setItem("notif_sound", soundOn ? "on" : "off"); } catch(e) {}
  document.getElementById("soundBtn").textContent = soundOn ? "🔔" : "🔇";
}
fetch("/api/contacts").then(r=>r.json()).then(list=>{
  document.getElementById("contactsList").innerHTML = list.length === 0
    ? '<span style="color:#888;font-size:13px">لا توجد جهات اتصال بعد. سيتم إضافة المرسلين تلقائياً.</span>'
    : '<table>' + list.map(c =>
      '<tr><td style="padding:4px 0">' + c.name + '</td>' +
      '<td style="padding:4px 0;direction:ltr;text-align:right">' + c.phone + '</td>' +
      '<td style="padding:4px 0"><a href="#" onclick="toggleContact(\'' + c.phone + '\');return false" style="color:' + (c.status==='active'?'#4caf50':'#e94560') + ';text-decoration:none">' + (c.status==='active'?'✅':'🔇') + '</a></td></tr>'
    ).join('') + '</table>';
}).catch(()=>{document.getElementById("contactsList").innerHTML='<span style="color:#888">فارغ</span>'});
function toggleContact(phone) {
  fetch("/api/toggle-status", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})})
  .then(r=>r.json()).then(function(d){location.reload()}).catch(function(){});
}
</script>
</body>
</html>`);
  });

  router.get("/admin/qr.png", async (req, res) => {
    const qr = getLatestQr();
    if (!qr) return res.status(404).send("No QR");
    res.setHeader("Content-Type", "image/png");
    res.send(await QRCode.toBuffer(qr, { type: "png", width: 300 }));
  });

  router.get("/admin/mode/:value", (req, res) => {
    const v = req.params.value;
    if (v === "ai" || v === "manual") {
      aiMode.current = v;
    }
    res.redirect("/admin");
  });

  router.get("/admin/disable", (req, res) => {
    let num = (req.query.num || "").replace(/[^0-9]/g, "");
    if (num.length >= 5) {
      if (!aiDisabledPhones.includes(num)) aiDisabledPhones.push(num);
      fs.writeFileSync("./ai-disabled.json", JSON.stringify(aiDisabledPhones));
    }
    res.redirect("/admin");
  });

  router.get("/admin/disable/:num", (req, res) => {
    let num = (req.params.num || "").replace(/[^0-9]/g, "");
    if (num.length >= 5) {
      if (!aiDisabledPhones.includes(num)) aiDisabledPhones.push(num);
      fs.writeFileSync("./ai-disabled.json", JSON.stringify(aiDisabledPhones));
    }
    res.redirect("/admin");
  });

  router.get("/admin/enable/:num", (req, res) => {
    const num = decodeURIComponent(req.params.num);
    const idx = aiDisabledPhones.indexOf(num);
    if (idx >= 0) aiDisabledPhones.splice(idx, 1);
    fs.writeFileSync("./ai-disabled.json", JSON.stringify(aiDisabledPhones));
    res.redirect("/admin");
  });

  return router;
}

module.exports = { createDashboard };
