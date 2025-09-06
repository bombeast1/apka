// server/server.js
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const app = express();
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

// --- In-memory úložiště ---
// uživatelské účty: username -> { salt, passHashHex }
const accounts = new Map();
// online: username -> { ws, publicKeyJwk }
const online = new Map();
// skupiny: groupName -> Set(usernames)
const groups = new Map();

// 🔐 Pomocné funkce pro hesla
function hashPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const hash = scryptSync(password, salt, 64);
  return hash.toString('hex');
}
function createAccount(username, password) {
  if (accounts.has(username)) return { ok:false, reason:'USER_EXISTS' };
  const salt = randomBytes(16).toString('hex');
  const passHashHex = hashPassword(password, salt);
  accounts.set(username, { salt, passHashHex });
  return { ok:true };
}
function verifyLogin(username, password) {
  const rec = accounts.get(username);
  if (!rec) return false;
  const hashHex = hashPassword(password, rec.salt);
  const a = Buffer.from(hashHex, 'hex');
  const b = Buffer.from(rec.passHashHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// 📡 Rozeslání seznamu online uživatelů
function broadcastUsers() {
  const list = Array.from(online.entries()).map(([name, info]) => ({
    username: name,
    publicKeyJwk: info.publicKeyJwk || null
  }));
  const payload = JSON.stringify({ type: 'users', users: list });
  for (const [, info] of online) {
    try { info.ws.send(payload); } catch {}
  }
}

// 📡 Rozeslání seznamu skupin + členů
function broadcastGroups() {
  const list = Array.from(groups.entries()).map(([g, set]) => ({
    name: g,
    members: Array.from(set)
  }));
  const payload = JSON.stringify({ type: 'groups', groups: list });
  for (const [, info] of online) {
    try { info.ws.send(payload); } catch {}
  }
}

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let myName = null;

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    const { type } = msg;

    // --- AUTH ---
    if (type === 'registerAccount') {
      const { username, password } = msg;
      const uname = String(username || '').trim();
      if (!uname || !password) return ws.send(JSON.stringify({ type:'auth', ok:false, reason:'BAD_INPUT' }));
      const r = createAccount(uname, password);
      return ws.send(JSON.stringify({ type:'auth', phase:'register', ...r }));
    }

    if (type === 'login') {
      const { username, password, publicKeyJwk } = msg;
      const uname = String(username || '').trim();
      if (!uname || !password) return ws.send(JSON.stringify({ type:'auth', ok:false, reason:'BAD_INPUT' }));
      if (!verifyLogin(uname, password)) {
        return ws.send(JSON.stringify({ type:'auth', phase:'login', ok:false, reason:'INVALID_CREDENTIALS' }));
      }
      myName = uname;
      online.set(myName, { ws, publicKeyJwk: publicKeyJwk || null });
      ws.send(JSON.stringify({ type:'auth', phase:'login', ok:true, username: myName }));
      broadcastUsers();
      broadcastGroups();
      return;
    }

    if (type === 'logout') {
      if (myName && online.has(myName)) {
        online.delete(myName);
        broadcastUsers();
      }
      return;
    }

    if (!myName) return; // neautorizovaný – ignoruj

    // --- UPDATE KEY ---
    if (type === 'updatePublicKey') {
      const { publicKeyJwk } = msg;
      const rec = online.get(myName);
      if (rec) { rec.publicKeyJwk = publicKeyJwk || null; }
      broadcastUsers();
      return;
    }

    // --- CHAT 1:1 ---
  if (type === 'message' || type === 'image' || type === 'call-offer' || type === 'call-answer' || type === 'ice-candidate' || type === 'hangup') {
  const { to, from, payload } = msg;
console.log("📩 Server received chat message:", msg);
  // 1:1 chat nebo hovor
  if (online.has(to)) {
    const target = online.get(to);
    if (target?.ws?.readyState === 1) {
      target.ws.send(JSON.stringify({ type, from, to, payload }));
    }
  }

  // Skupiny (volitelné – jen pokud chceš group chat/hovor)
  if (groups.has(to)) {
    for (const member of groups.get(to)) {
      if (member === from) continue;
      const target = online.get(member);
      if (target?.ws?.readyState === 1) {
        target.ws.send(JSON.stringify({ type, from, to, payload }));
      }
    }
  }
  return;
}




    // --- SKUPINY ---
    if (type === 'create-group') {
      const { name } = msg;
      const g = String(name || '').trim();
      if (!g) return;
      if (!groups.has(g)) groups.set(g, new Set());
      groups.get(g).add(myName);
      broadcastGroups();
      return;
    }

    if (type === 'join-group') {
      const { name } = msg;
      const g = String(name || '').trim();
      if (!g || !groups.has(g)) return;
      groups.get(g).add(myName);
      broadcastGroups();
      return;
    }

    if (type === 'leave-group') {
      const { name } = msg;
      const g = String(name || '').trim();
      if (!g || !groups.has(g)) return;
      groups.get(g).delete(myName);
      broadcastGroups();
      return;
    }

    if (type === 'group-message') {
      const { group, payload } = msg;
      const g = groups.get(group);
      if (!g) return;
      for (const member of g) {
        if (member === myName) continue;
        const target = online.get(member);
        if (target && target.ws && target.ws.readyState === 1) {
          target.ws.send(JSON.stringify({ type:'group-message', from: myName, group, payload }));
        }
      }
      return;
    }

    // --- WebRTC SIGNALIZACE + vyzvánění ---
    if (['call-offer','call-answer','ice-candidate','hangup','ring','ring-stop'].includes(type)) {
      const { to } = msg;
      const target = online.get(to);
      if (target && target.ws && target.ws.readyState === 1) {
        target.ws.send(JSON.stringify(msg));
      }
      return;
    }
  });

  ws.on('close', () => {
    if (myName && online.has(myName)) {
      online.delete(myName);
      broadcastUsers();
    }
  });
});

server.listen(PORT, () => {
  console.log('✅ WS signaling server listening on :' + PORT);
});
