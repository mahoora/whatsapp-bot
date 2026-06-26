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

  // API لجلب قائمة العائلة وتحديث حالة الـ AI لكل شخص بشكل حي
  router.get("/api/family-contacts", (req, res) => {
    try {
      if (fs.existsSync("./family-contacts.json")) {
        const raw = fs.readFileSync("./family-contacts.json", "utf8");
        let list = JSON.parse(raw);
        list = list.map(c => {
          let phone = (c.phone || "").replace(/[^0-9]/g, "");
          c.aiDisabled = aiDisabledPhones.includes(phone);
          return c;
        });
        return res.json(list);
      }
    } catch (e) {}
    res.json([]);
  });

  // API لتحديث وحفظ رقم الهاتف للشخص يدوياً
  router.post("/api/update-family-phone", express.json(), (req, res) => {
    try {
      const { name, phone } = req.body;
      if (fs.existsSync("./family-contacts.json")) {
        let family = JSON.parse(fs.readFileSync("./family-contacts.json", "utf8"));
        family = family.map(c => {
          if (c.name === name) c.phone = phone;
          return c;
        });
        fs.writeFileSync("./family-contacts.json", JSON.stringify(family, null, 2));
        return res.json({ updated: true });
      }
    } catch (e) {}
    res.json({ updated: false });
  });

  // الـ Endpoint الحقيقي والنهائي لتشغيل وإيقاف الـ AI وحفظه في السيرفر
  router.get("/admin/toggle-ai/:num", (req, res) => {
    let num = (req.params.num || "").replace(/[^0-9]/g, "");
    let isNowDisabled = false;
    if (num.length >= 5) {
      const idx = aiDisabledPhones.indexOf(num);
      if (idx >= 0) {
        aiDisabledPhones.splice(idx, 1); // تشغيل (إزالة من قائمة المعطلين)
        isNowDisabled = false;
      } else {
        aiDisabledPhones.push(num); // إيقاف (إضافة لقائمة المعطلين)
        isNowDisabled = true;
      }
      fs.writeFileSync("./ai-disabled.json", JSON.stringify(aiDisabledPhones, null, 2));
    }
    res.json({ disabled: isNowDisabled });
  });

  router.get("/admin", (req, res) => {
    const mode = aiMode.current === "ai" ? "🤖" : "🖐";
    const modeText = aiMode.current === "ai" ? "رد الذكاء" : "رد يدوي";
    const connected = isConnected();

    let convRows = "";
    const { conversationHistory } = require("../message-handler");
    for (const [jid] of conversationHistory) {
      const phone = jid.split("@")[0].replace(/[^0-9]/g, "");
      const isOff = aiDisabledPhones.some(p => phone.includes(p) || jid.includes(p));
      convRows += `<tr><td style="padding:6px 0">${phone}</td>
        <td><a href="/admin/disable/${encodeURIComponent(phone)}${authToken ? "?token=" + authToken : ""}" class="btn btn-red" style="padding:4px 10px;font-size:12px">${isOff ? "🔇" : "🔊"}</a></td></tr>`;
    }

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
.card{background:rgba(32,44,51,0.6);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:16px;margin:12px 0;}
.card h2{font-size:16px;color:#e9edef;margin-bottom:8px}
.status-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-left:6px}
.dot-on{background:#4caf50;}
.dot-off{background:#e94560;}
.btn{display:inline-block;padding:10px 20px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:bold;border:none;cursor:pointer;}
.btn-red{background:#e94560;color:#fff}
input{padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(42,57,66,0.6);color:#e9edef;font-size:14px;width:100%;outline:none;}
form{display:flex;gap:8px;margin:8px 0}
table{width:100%;font-size:13px;border-collapse:collapse}
td{padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.fab{position:fixed;bottom:16px;left:0;right:0;display:flex;justify-content:center;z-index:99;padding:0 16px;}
.fab-btn{flex:1;max-width:180px;text-align:center;padding:14px 0;color:#fff;font-size:14px;font-weight:bold;text-decoration:none;}
.fab-left{border-radius:30px 0 0 30px;background:#4caf50}
.fab-right{border-radius:0 30px 30px 0;background:#e94560}
.fab-inactive{background:#555;opacity:0.5}
.qr-img{display:block;margin:12px auto;border-radius:12px;max-width:250px}
.toast{position:fixed;top:20px;right:20px;z-index:999;background:rgba(0,168,132,0.9);color:#fff;padding:12px 20px;border-radius:12px;display:none}

/* تصميم الشبكة يمين ويسار */
.family-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
@media(max-width:480px){.family-grid{grid-template-columns:1fr}}
.family-card{background:rgba(255,255,255,0.03);padding:10px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;border:1px solid rgba(255,255,255,0.05)}
.family-info{display:flex;flex-direction:column;gap:4px;text-align:right;width:65%;}

/* زر الـ Toggle الحقيقي */
.switch{position:relative;display:inline-block;width:40px;height:22px;}
.switch input{opacity:0;width:0;height:0}
.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#e94560;transition:0.3s;border-radius:22px}
.slider:before{position:absolute;content:"";height:14px;width:14px;left:4px;bottom:4px;background:#fff;transition:0.3s;border-radius:50%}
.switch input:checked+.slider{background:#4caf50}
.switch input:checked+.slider:before{transform:translateX(18px)}
</style>
</head>
<body>
<div id="toast" class="toast"></div>
<h1>🔧 ماهر البدري</h1>

<div class="card" style="text-align:center">
  <span class="status-dot ${connected ? "dot-on" : "dot-off"}"></span>
  ${connected ? "✅ متصل بالواتساب" : "❌ غير متصل"} | ${mode} ${modeText}
</div>

<div class="card" id="familyCard">
  <h2>👨‍👩‍👧‍👦 العائلة - التحكم بالذكاء (يمين وشمال)</h2>
  <div id="familyList" style="font-size:13px">جاري التحميل...</div>
</div>

<div class="card" id="conversationsCard">
  <h2>💬 المحادثات النشطة</h2>
  <div id="convList"><table>${convRows || '<tr><td style="color:#888;text-align:center">لا يوجد محادثات حالياً</td></tr>'}</table></div>
</div>

<div class="fab">
  <a href="/admin/mode/ai${authToken ? "?token=" + authToken : ""}" class="fab-btn fab-left ${aiMode.current === "ai" ? "" : "fab-inactive"}">🤖 تلقائي</a>
  <a href="/admin/mode/manual${authToken ? "?token=" + authToken : ""}" class="fab-btn fab-right ${aiMode.current === "manual" ? "" : "fab-inactive"}">🖐 يدوي</a>
</div>

<script>
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 2500);
}

function loadFamily() {
  var el = document.getElementById("familyList");
  if (!el) return;
  fetch("/api/family-contacts${authToken ? "?token=" + authToken : ""}").then(function(r){ return r.json(); }).then(function(list){
    el.innerHTML = list.length === 0 ? '<span style="color:#888">قائمة العائلة فارغة.</span>'
      : '<div class="family-grid">' + list.map(function(c, i){
          var phone = (c.phone||"").replace(/[^0-9]/g,"");
          var hasPhone = phone.length > 0;
          var isAiActive = !c.aiDisabled; // إذا لم يكن معطلاً إذن فهو يعمل
          var safeName = (c.name||"").replace(/[<>&"]/g,'');
          var safePhone = (c.phone||"").replace(/[<>&"]/g,'');
          
          return '<div class="family-card">' +
            '<div class="family-info">' +
              '<span style="font-weight:bold">' + safeName + ' (' + c.relationship + ')</span>' +
              '<span id="fp_' + i + '" ' + (hasPhone ? 'style="color:#8696a0;font-size:11px"' : 'onclick="editFamilyPhone(' + i + ',\'' + safeName + '\')" style="cursor:pointer;color:#00a884;font-size:11px"') + '>' + (safePhone || '➕ أضف رقم') + '</span>' +
              '<input id="fi_' + i + '" style="display:none;width:100%;padding:4px;background:#1a2a33;color:#fff;font-size:11px;border:1px solid #00a884;border-radius:4px" placeholder="9665..." onblur="saveFamilyPhone(' + i + ',\'' + safeName + '\')">' +
            '</div>' +
            '<div>' + (hasPhone
              ? '<label class="switch"><input type="checkbox" ' + (isAiActive ? 'checked' : '') + ' onchange="toggleAI(\'' + phone + '\', this)"><span class="slider"></span></label>'
              : '<span style="color:#555;font-size:11px">بلا رقم</span>') + '</div></div>';
        }).join('') + '</div>';
  });
}

function toggleAI(phone, cb) {
  if (!phone) return;
  // إرسال طلب حقيقي للسيرفر لحفظ التغيير فوراً في الـ json
  fetch("/admin/toggle-ai/" + phone + "${authToken ? "?token=" + authToken : ""}").then(function(r){ return r.json(); }).then(function(d){
    cb.checked = !d.disabled;
    showToast(!d.disabled ? "تم تفعيل الذكاء للرقم" : "تم إيقاف الذكاء للرقم");
  }).catch(function(){
    cb.checked = !cb.checked;
  });
}

function editFamilyPhone(idx, name) {
  var span = document.getElementById("fp_" + idx);
  var inp = document.getElementById("fi_" + idx);
  if(span && inp) { span.style.display="none"; inp.style.display="block"; inp.focus(); }
}

function saveFamilyPhone(idx, name) {
  var inp = document.getElementById("fi_" + idx);
  if(!inp || !inp.value.trim()) { loadFamily(); return; }
  fetch("/api/update-family-phone${authToken ? "?token=" + authToken : ""}", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ name: name, phone: inp.value.trim() })
  }).then(function(){ loadFamily(); });
}

window.onload = loadFamily;
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
    if (v === "ai" || v === "manual") aiMode.current = v;
    res.redirect("/admin" + (authToken ? "?token=" + authToken : ""));
  });

  return router;
}

module.exports = { createDashboard };
