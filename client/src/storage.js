// client/src/storage.js
const LS_KEY = 'e2ee-chat-store';

function read() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}
function write(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}

export function setLastLogin(name) {
  const db = read();
  db.lastLogin = name;
  write(db);
}
export function getLastLogin() {
  const db = read();
  return db.lastLogin || '';
}

// Chat historie: klíč 'dm:<me>:<peer>' nebo 'group:<name>'
export function appendHistory(me, peer, msg) {
  const db = read();
  const key = peer.startsWith('group:') ? peer : `dm:${me}:${peer}`;
  db.history = db.history || {};
  db.history[key] = db.history[key] || [];
  db.history[key].push({ t: Date.now(), ...msg });
  write(db);
}

export function getHistory(me, peer) {
  const db = read();
  const key = peer.startsWith('group:') ? peer : `dm:${me}:${peer}`;
  return db.history?.[key] || [];
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
