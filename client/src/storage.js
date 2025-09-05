// client/src/storage.js
const LS_KEY = 'e2ee-chat-store';

function read() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}
function write(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}

export function saveAccount(username, hashed) {
  const db = read();
  db.accounts = db.accounts || {};
  db.accounts[username] = { hashed };
  write(db);
}
export function getAccount(username) {
  const db = read();
  return db.accounts?.[username] || null;
}
export function setLastLogin(u) {
  const db = read(); db.lastLogin = u; write(db);
}
export function getLastLogin() {
  const db = read(); return db.lastLogin || '';
}

export function appendHistory(me, peer, msg) {
  const db = read();
  db.history = db.history || {};
  const key = `dm:${me}:${peer}`;
  db.history[key] = db.history[key] || [];
  db.history[key].push({ t: Date.now(), ...msg });
  write(db);
}
export function getHistory(me, peer) {
  const db = read();
  return db.history?.[`dm:${me}:${peer}`] || [];
}

export function saveGroups(list) {
  const db = read();
  db.groups = list;
  write(db);
}
export function loadGroups() {
  const db = read();
  return db.groups || [];
}
