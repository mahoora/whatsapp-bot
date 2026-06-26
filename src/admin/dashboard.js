const express = require("express");
const QRCode = require("qrcode");
const fs = require("fs");

function createDashboard(getSock, isConnected, getLatestQr, aiDisabledPhones, aiMode, stats, adminJid, adminPassword) {
  const router = express.Router();

  const authToken = adminPassword ? encodeURIComponent(adminPassword) : "";

  function checkAuth(req, res, next) {
    if (!adminPassword) return next();
    const token = req.query.token || req.headers["x-admin-token"];
    if (token === adminPassword) return next();
    if (req.query.token) return res.redirect("/admin?token=" + authToken);
    return res.send(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>دخول</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;background:#0b141a;color:#eee;display:flex;justify-content:center;align-items:center;height:100vh;padding:20px}form{background:rgba(32,44,51,0.6);padding:30px;border-radius:16px;max-width:300px;width:100%}h2{text-align:center;color:#00a884;margin-bottom:20px}input{padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(42,57,66,0.6);color:#e9edef;font-size:14px;width:100%;outline:none;margin:8px 0}button{width:100%;padding:12px;background:#00a884;color:#fff;border:none;border-radius:10px;font-size:16px;cursor:pointer}</style></head><body><form method="GET"><h2>🔐 كلمة المرور</h2><input name="token" type="password" placeholder="كلمة المرور" required><button type="submit">دخول</button></form></body></html>`);
  }

  router.use(checkAuth);

  router.get("/", (req, res) => {
    res.redirect("/admin" + (authToken ? "?token=" + authToken : ""));
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
        <td><a href="/admin/disable/${encodeURIComponent(phone)}${authToken ? "?token=" + authToken : ""}" class="btn btn-red" style="padding:4px 10px;font-size:12px">${isOff ? "🔇" : "🔊"}</a></td></tr>`;
    }

    // Server-rendered contacts
    const contactsDb = require("../contacts-db");
    const allContacts = contactsDb.getContacts();
    let contactsHtml = allContacts.length === 0
      ? '<span style="color:#888;font-size:13px">لا توجد جهات اتصال بعد. سيتم إضافة المرسلين تلقائياً.</span>'
      : '<table>' + allContacts.map(function(c) {
          var isActive = c.status === "active";
          var safeName = (c.name||"").replace(/[<>&"]/g,'');
          var safePhone = (c.phone||"").replace(/[<>&"]/g,'');
          return '<tr><td style="padding:4px 0">' + safeName + '</td>' +
            '<td style="padding:4px 0;direction:ltr;text-align:right">' + safePhone + '</td>' +
            '<td style="padding:4px 0"><button onclick="toggleContact(\'' + safePhone + '\')" style="background:none;border:none;cursor:pointer;font-size:18px;color:' + (isActive ? '#4caf50' : '#e94560') + '" title="' + (isActive ? 'اضغط للإيقاف' : 'اضغط للتفعيل') + '">' + (isActive ? '✅' : '🔇') + '</button></td></tr>';
        }).join('') + '</table>';

    // Server-rendered family contacts (Grid system Layout)
    let familyHtml = '<span style="color:#888">جاري التحميل...</span>';
    try {
      const raw = fs.readFileSync("./family-contacts.json", "utf8");
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        familyHtml = '<div class="family-grid">' + list.map(function(c, i){
          var phone = (c.phone||"").replace(/[^0-9]/g,"");
          var hasPhone = phone.length > 0;
          var checked = !c.aiDisabled;
          var safeName = (c.name||"").replace(/[<>&"]/g,'');
          var safePhone = (c.phone||"").replace(/[<>&"]/g,'');
          return '<div class="family-card">' +
            '<div class="family-info">' +
              '<span style="font-weight:bold">' + safeName + '</span>' +
              '<span id="fp_' + i + '" ' + (hasPhone ? 'style="direction:ltr;text-align:right;font-size:11px;color:#8696a0"' : 'onclick="editFamilyPhone(' + i + ',\'' + safeName + '\')" style="cursor:pointer;color:#00a884;font-size:11px" title="اضغط لإضافة رقم"') + '>' + (safePhone || '➕ أضف رقم') + '</span>' +
              '<input id="fi_' + i + '" style="display:none;width:120px;padding:4px;border-radius:6px;border:1px solid #00a884;background:#1a2a33;color:#e9edef;font-size:11px;direction:ltr" placeholder="مثال: 9665xxxxxxxx" onkeydown="if(event.key==\'Enter\')saveFamilyPhone(' + i + ',\'' + safeName + '\')" onblur="saveFamilyPhone(' + i + ',\'' + safeName + '\')">' +
            '</div>' +
            '<div>' + (hasPhone
              ? '<label class="switch"><input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="toggleAI(\'' + phone + '\',this)"><span class="slider"></span></label>'
              : '<span style="color:#555;font-size:11px">بدون رقم</span>') + '</div></div>';
        }).join('') + '</div>';
      }
    } catch(e) {}

    res.send(`<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="utf-8">
<title>تحكم البوت - ماهر البدري</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="/socket.io/socket.io.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:sans-serif;background:linear-gradient(135deg,#0b141a,#15222b);color:#eee;padding:20px;max-width:500px;margin:auto;min-height:100vh}
h1{text-align:center;color:#00a884;font-size:22px;margin-bottom:20px}
.card{background:rgba(32,44,51,0.6);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:16px;margin:12px 0;transition:0.3s}
.card.flash{border-color:#00a884;box-shadow:0 0 20px rgba(0,168,132,0.2)}
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
.switch{position:relative;display:inline-block;width:42px;height:22px;vertical-align:middle}
.switch input{opacity:0;width:0;height:0}
.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#e94560;transition:0.3s;border-radius:22px}
.slider:before{position:absolute;content:"";height:16px;width:16px;left:3px;bottom:3px;background:#fff;transition:0.3s;border-radius:50%}
.switch input:checked+.slider{background:#4caf50}
.switch input:checked+.slider:before{transform:translateX(20px)}
.stats{display:flex;gap:8px;flex-wrap:wrap}
.stat-box{flex:1;min-width:80px;background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;text-align:center}
.stat-box .num{font-size:20px;font-weight:bold;color:#00a884}
.stat-box .label{font-size:11px;color:#8696a0;margin-top:4px}
.toast{position:fixed;top:20px;right:20px;z-index:999;background:rgba(0,168,132,0.9);color:#fff;padding:12px 20px;border-radius:12px;font-size:14px;max-width:300px;animation:slideIn 0.3s;display:none}
@keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}

/* تنسيقات العرض الجانبي (يمين وشمال) لبطاقات العائلة */
.family-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
@media(max-width:480px){.family-grid{grid-template-columns:1fr}}
.family-card{background:rgba(255,255,255,0.03);padding:10px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;border:1px solid rgba(255,255,255,0.05)}
.family-info{display:flex;flex-direction:column;gap:4px;text-align:right}
</style>
</head>
<body>
<div id="toast" class="toast"></div>
<h1>🔧 ماهر البدري</h1>

<div class="card" style="text-align:center" id="statusCard">
  <span class="status-dot ${connected ? "dot-on" : "dot-off"}"></span>
  ${connected ? "✅ متصل بالواتساب" : "❌ غير متصل"}
  <span style="margin:0 8px">|</span>
  ${mode} ${modeText}
</div>

<div class="card">
  <div class="stats">
    <div class="stat-box"><div class="num" id="msgCount">${stats.msgCount}</div><div class="label">رسائل</div></div>
    <div class="stat-box"><div class="num" id="convCount">${conversationHistory.size}</div><div class="label">محادثات</div></div>
    <div class="stat-box"><div class="num" id="disabledCount">${aiDisabledPhones.length}</div><div class="label">ممنوعين</div></div>
  </div>
</div>

<div class="card">
  <h2>🔇 إيقاف الزكاء عن رقم</h2>
  <form action="/admin/disable${authToken ? "?token=" + authToken : ""}" method="get">
    <input name="num" placeholder="آخر 9 أرقام" required>
    <button type="submit" class="btn btn-red btn-sm">🔇 إيقاف</button>
  </form>
</div>

${!connected ? `<div class="card" style="text-align:center" id="qrCard">
  <h2>📱 امسح QR</h2>
  <p style="font-size:12px;color:#8696a0;margin-bottom:8px">افتح واتساب ← الأجهزة المرتبطة ← امسح</p>
  <div id="qrWrap">${getLatestQr() ? `<img src="/admin/qr.png" class="qr-img" alt="QR">` : `<p style="color:#888;font-size:13px" id="qrWait">جاري التوليد...</p>`}</div>
</div>` : ""}

<div class="card" id="conversationsCard">
  <h2>💬 المحادثات (${conversationHistory.size})</h2>
  <div id="convList"><table>${convRows || '<tr><td style="color:#888;text-align:center">لا يوجد</td></tr>'}</table></div>
</div>

<div class="card" id="contactsCard">
  <h2>📋 جهات الاتصال</h2>
  <div id="contactsList" style="font-size:13px">${contactsHtml}</div>
</div>

<div class="card" id="familyCard">
  <h2>👨‍👩‍👧‍👦 العائلة - التحكم بالزكاء</h2>
  <div id="familyList" style="font-size:13px">${familyHtml}</div>
</div>

<div class="card" id="notifCard">
  <h2>🔔 الإشعارات</h2>
  <p style="margin:6px 0;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button id="soundBtn" onclick="toggleSound()" style="background:none;border:1px solid #555;color:#eee;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:14px">🔔</button> صوت
    <button id="notifBtn" onclick="toggleDesktopNotif()" style="background:none;border:1px solid #555;color:#eee;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:14px">🔔</button> إشعار سطح المكتب
    <span id="vibeStatus" style="font-size:12px;color:#8696a0">📳 متاح</span>
  </p>
</div>

<div class="card">
  <h2>ℹ️ معلومات</h2>
  <p style="font-size:12px;color:#8696a0">آخر خطأ: ${stats.lastError || "لا يوجد"}</p>
  <p style="font-size:12px;color:#8696a0">آخر فرع: ${stats.lastBranch || "-"}</p>
  <p style="margin-top:10px">
    <a href="/admin/restart${authToken ? "?token=" + authToken : ""}" class="btn btn-red btn-sm" style="text-decoration:none" onclick="return confirm('إعادة تشغيل اتصال واتساب؟')">🔄 إعادة تشغيل</a>
    <a href="/admin/clear-qr${authToken ? "?token=" + authToken : ""}" class="btn btn-gray btn-sm" style="text-decoration:none;margin-right:8px" onclick="return confirm('مسح البيانات وإعادة الاتصال؟')">🗑️ مسح وإعادة</a>
  </p>
</div>

<div class="fab">
  <a href="/admin/mode/ai" class="fab-btn fab-left ${aiMode.current === "ai" ? "" : "fab-inactive"}">🤖 تلقائي</a>
  <a href="/admin/mode/manual" class="fab-btn fab-right ${aiMode.current === "manual" ? "" : "fab-inactive"}">🖐 يدوي</a>
</div>

<div class="footer"><a href="/admin">تحديث الصفحة</a></div>
<script>
let soundOn = true;
let desktopNotifOn = true;
try { soundOn = localStorage.getItem("notif_sound") !== "off"; } catch(e) {}
try { desktopNotifOn = localStorage.getItem("notif_desktop") !== "off"; } catch(e) {}
if (typeof Notification !== "undefined" && Notification.permission === "default") {
  Notification.requestPermission();
}

(function loadContacts() {
  var el = document.getElementById("contactsList");
  if (!el) { setTimeout(loadContacts, 500); return; }
  fetch("/api/contacts").then(function(r){return r.json()}).then(function(list){
    el.innerHTML = list.length === 0
      ? '<span style="color:#888;font-size:13px">لا توجد جهات اتصال بعد. سيتم إضافة المرسلين تلقائياً.</span>'
      : '<table>' + list.map(function(c) {
          var isActive = c.status === "active";
          return '<tr><td style="padding:4px 0">' + (c.name||'').replace(/[<>&"]/g,'') + '</td>' +
            '<td style="padding:4px 0;direction:ltr;text-align:right">' + c.phone + '</td>' +
            '<td style="padding:4px 0"><button onclick="toggleContact(\'' + c.phone + '\')" style="background:none;border:none;cursor:pointer;font-size:18px;color:' + (isActive ? '#4caf50' : '#e94560') + '" title="' + (isActive ? 'اضغط للإيقاف' : 'اضغط للتفعيل') + '">' + (isActive ? '✅' : '🔇') + '</button></td></tr>';
        }).join('') + '</table>';
  }).catch(function(){
    if (el) el.innerHTML='<span style="color:#888">فارغ</span>';
  });
})();

var audioCtx = null;
var useBeepFallback = true;
document.addEventListener("click", function(){
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e) {}
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  useBeepFallback = false;
}, { once: true });

function beep() {
  if (!soundOn) return;
  try {
    if (!useBeepFallback && audioCtx && audioCtx.state !== "closed") {
      if (audioCtx.state === "suspended") audioCtx.resume();
      if (audioCtx.state === "running") {
        var ctx = audioCtx;
        var now = ctx.currentTime;
        var tones = [
          {f:660, t:0.05, d:0.12},
          {f:880, t:0.19, d:0.12},
          {f:1100, t:0.33, d:0.18},
        ];
        for (var i = 0; i < tones.length; i++) {
          var t = tones[i];
          var o = ctx.createOscillator();
          var g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = t.f; o.type = "sine";
          g.gain.setValueAtTime(0.3, now + t.t);
          g.gain.exponentialRampToValueAtTime(0.01, now + t.t + t.d);
          o.start(now + t.t); o.stop(now + t.t + t.d);
        }
        return;
      }
    }
  } catch(e) {}
  try {
    var s = new Audio();
    s.src = "data:audio/wav;base64,...";
    s.volume = 0.3;
    s.play().catch(function(){});
  } catch(e) {}
}

function vibrate() {
  try { if (navigator.vibrate) navigator.vibrate([100,50,100]); } catch(e) {}
}

function showDesktopNotif(title, body) {
  if (!desktopNotifOn) return;
  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/admin/qr.png" });
    }
  } catch(e) {}
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 3000);
}

function flashCard(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 600);
}

function toggleSound() {
  soundOn = !soundOn;
  try { localStorage.setItem("notif_sound", soundOn ? "on" : "off"); } catch(e) {}
  document.getElementById("soundBtn").textContent = soundOn ? "🔔" : "🔇";
  showToast(soundOn ? "الصوت مفعل" : "الصوت متوقف");
}

function toggleDesktopNotif() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "denied") {
    showToast("الإشعارات مرفوضة من المتصفح");
    return;
  }
  if (Notification.permission === "default") {
    Notification.requestPermission().then(function(p) {
      if (p === "granted") {
        desktopNotifOn = true;
        try { localStorage.setItem("notif_desktop", "on"); } catch(e) {}
        document.getElementById("notifBtn").textContent = "🔔";
        showToast("تم تفعيل إشعارات سطح المكتب");
      }
    });
    return;
  }
  desktopNotifOn = !desktopNotifOn;
  try { localStorage.setItem("notif_desktop", desktopNotifOn ? "on" : "off"); } catch(e) {}
  document.getElementById("notifBtn").textContent = desktopNotifOn ? "🔔" : "🔇";
  showToast(desktopNotifOn ? "إشعارات سطح المكتب مفعلة" : "إشعارات سطح المكتب متوقفة");
}

loadFamily();

try { if (!navigator.vibrate) document.getElementById("vibeStatus").textContent = "📳 غير متاح"; } catch(e) {}

function updateQR() {
  var wrap = document.getElementById("qrWrap");
  if (!wrap) return;
  fetch("/admin/qr-status").then(function(r){return r.json()}).then(function(d){
    if (d.hasQr) {
      wrap.innerHTML = '<img src="/admin/qr.png?' + Date.now() + '" class="qr-img" alt="QR">';
    } else if (!d.connected && !wrap.querySelector("img")) {
      wrap.innerHTML = '<p style="color:#888;font-size:13px" id="qrWait">جاري التوليد...</p>';
    }
  }).catch(function(){});
}

var evtSource = new EventSource("/events");
evtSource.addEventListener("connected", function(e) {
  updateQR();
});
setInterval(updateQR, 3000);

var socket = io();
socket.on("new_message", function(data) {
  try {
    var snd = new Audio("/notification.wav");
    snd.volume = 0.3;
    snd.play().catch(function(){ beep(); });
  } catch(e) { beep(); }
  vibrate();
  var phone = (data && data.from) ? data.from.split("@")[0].replace(/[^0-9]/g, "") : "";
  var name = (data && data.name) || phone || "Unknown";
  showDesktopNotif("📩 رسالة جديدة من " + name, phone + (data && data.text ? ": " + data.text.substring(0, 60) : ""));
  showToast("رسالة من " + name);
  flashCard("conversationsCard");
});

// دالة تحميل العائلة المحدثة لتعرض كروت يمين ويسار
function loadFamily() {
  var el = document.getElementById("familyList");
  if (!el) { setTimeout(loadFamily, 500); return; }
  el.innerHTML = "جاري التحميل...";
  fetch("/api/family-contacts").then(function(r){
    return r.json();
  }).then(function(list){
    el.innerHTML = list.length === 0 ? '<span style="color:#888">لا يوجد أفراد عائلة</span>'
      : '<div class="family-grid">' + list.map(function(c, i){
          var phone = (c.phone||"").replace(/[^0-9]/g,"");
          var hasPhone = phone.length > 0;
          var checked = !c.aiDisabled;
          var safeName = (c.name||"").replace(/[<>&"]/g,'');
          var safePhone = (c.phone||"").replace(/[<>&"]/g,'');
          return '<div class="family-card">' +
            '<div class="family-info">' +
              '<span style="font-weight:bold">' + safeName + '</span>' +
              '<span id="fp_' + i + '" ' + (hasPhone ? 'style="direction:ltr;text-align:right;font-size:11px;color:#8696a0"' : 'onclick="editFamilyPhone(' + i + ',\'' + safeName + '\')" style="cursor:pointer;color:#00a884;font-size:11px" title="اضغط لإضافة رقم"') + '>' + (safePhone || '➕ أضف رقم') + '</span>' +
              '<input id="fi_' + i + '" style="display:none;width:120px;padding:4px;border-radius:6px;border:1px solid #4caf50;background:#1a2a33;color:#e9edef;font-size:11px;direction:ltr" placeholder="مثال: 9665xxxxxxxx" onkeydown="if(event.key==\'Enter\')saveFamilyPhone(' + i + ',\'' + safeName + '\')" onblur="saveFamilyPhone(' + i + ',\'' + safeName + '\')">' +
            '</div>' +
            '<div>' + (hasPhone
              ? '<label class="switch"><input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="toggleAI(\'' + phone + '\',this)"><span class="slider"></span></label>'
              : '<span style="color:#555;font-size:11px">بدون رقم</span>') + '</div></div>';
        }).join('') + '</div>';
  }).catch(function(e){
    if(el) el.innerHTML='<span style="color:#e94560">خطأ: ' + (e.message||e) + '</span>';
  });
}

function editFamilyPhone(idx, name) {
  var span = document.getElementById("fp_" + idx);
  var inp = document.getElementById("fi_" + idx);
  if (!span || !inp) return;
  span.style.display = "none";
  inp.style.display = "inline-block";
  inp.focus();
}

function saveFamilyPhone(idx, name) {
  var inp = document.getElementById("fi_" + idx);
  var span = document.getElementById("fp_" + idx);
  if (!inp || !span) return;
  var phone = inp.value.trim();
  inp.style.display = "none";
  fetch("/api/update-family-phone", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name,phone:phone})})
  .then(function(r){return r.json()}).then(function(d){
    if (d.updated) loadFamily();
  }).catch(function(){ loadFamily(); });
}

// دالة التفعيل والإيقاف الحقيقية المرتبطة بـ السيرفر الخاص بك مباشرة
function toggleAI(phone, cb) {
  if (!phone) { cb.checked = !cb.checked; return; }
  fetch("/toggle-ai/" + phone).then(function(r){return r.json()}).then(function(d){
    cb.checked = !d.disabled;
  }).catch(function(e){
    console.error("toggleAI error:", e);
    cb.checked = !cb.checked;
  });
}

function toggleContact(phone) {
  var btn = event && event.target;
  if (btn) btn.disabled = true;
  fetch("/api/toggle-status", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:phone})})
  .then(function(r){return r.json()}).then(function(){
    return fetch("/api/contacts").then(function(r){return r.json()});
  }).then(function(list){
    var el = document.getElementById("contactsList");
    if (!el) return;
    el.innerHTML = list.length === 0
      ? '<span style="color:#888;font-size:13px">لا توجد جهات اتصال بعد</span>'
      : '<table>' + list.map(function(c) {
          var a = c.status === "active";
          return '<tr><td style="padding:4px 0">' + (c.name||'').replace(/[<>&"]/g,'') +
            '</td><td style="padding:4px 0;direction:ltr;text-align:right">' + c.phone +
            '</td><td style="padding:4px 0"><button onclick="toggleContact(\'' + c.phone + '\')" style="background:none;border:none;cursor:pointer;font-size:18px;color:' + (a ? '#4caf50' : '#e94560') + '">' + (a ? '✅' : '🔇') + '</button></td></tr>';
        }).join('') + '</table>';
    if (btn) btn.disabled = false;
  }).catch(function(){ if(btn) btn.disabled = false; });
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
