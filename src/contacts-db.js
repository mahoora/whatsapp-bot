const fs = require("fs");
const path = require("path");
const DATA_FILE = path.join(__dirname, "..", "data", "contacts.json");

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch (e) { return []; }
}

function save(contacts) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(contacts, null, 2));
}

let contacts = load();

function getContacts() { return contacts; }

function findContact(phone) {
  const clean = phone.replace(/[^0-9]/g, "");
  return contacts.find(c => c.phone.replace(/[^0-9]/g, "").includes(clean) || clean.includes(c.phone.replace(/[^0-9]/g, "")));
}

function isAllowedToReply(senderNumber) {
  const c = findContact(senderNumber);
  if (c && c.status === "inactive") return false;
  return true;
}

function upsertContact(name, phone, status = "active") {
  const clean = phone.replace(/[^0-9]/g, "");
  const existing = contacts.findIndex(c => c.phone.replace(/[^0-9]/g, "").includes(clean) || clean.includes(c.phone.replace(/[^0-9]/g, "")));
  if (existing >= 0) {
    contacts[existing] = { name, phone, status };
  } else {
    contacts.push({ name, phone, status });
  }
  save(contacts);
  return true;
}

function setStatus(phone, status) {
  const clean = phone.replace(/[^0-9]/g, "");
  const c = contacts.find(c => c.phone.replace(/[^0-9]/g, "").includes(clean) || clean.includes(c.phone.replace(/[^0-9]/g, "")));
  if (c) { c.status = status; save(contacts); return true; }
  return false;
}

function toggleStatus(phone) {
  const clean = phone.replace(/[^0-9]/g, "");
  const c = contacts.find(c => c.phone.replace(/[^0-9]/g, "").includes(clean) || clean.includes(c.phone.replace(/[^0-9]/g, "")));
  if (c) {
    c.status = c.status === "active" ? "inactive" : "active";
    save(contacts);
    return c.status;
  }
  return null;
}

function refresh() {
  contacts = load();
  return contacts;
}

module.exports = { getContacts, findContact, isAllowedToReply, upsertContact, setStatus, toggleStatus, refresh };