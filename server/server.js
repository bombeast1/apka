// server.js
import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  console.log(`WS signaling server listening on :${PORT}`);
});

// In-memory registry: username -> { ws, publicKeyJwk }
const users = new Map();

// 🔥 Funkce na odeslání seznamu uživatelů všem
function broadcastUsers() {
  const list = Array.from(users.entries()).map(([name, info]) => ({
    username: name,
    publicKeyJwk: info.publicKeyJwk
  }));
  console.log("Aktuální seznam uživatelů:", list); // 🔥 DEBUG
  const payload = JSON.stringify({ type: 'users', users: list });
  for (const [, info] of users) {
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

    if (type === 'register') {
      const { username, publicKeyJwk } = msg;
      myName = String(username || '').trim();
      if (!myName) return;
      users.set(myName, { ws, publicKeyJwk });
      console.log(`Registered: ${myName}`);
      broadcastUsers(); // 🔥 po připojení hned rozešli seznam
      return;
    }

    if (type === 'logout') {
      if (myName && users.has(myName)) {
        users.delete(myName);
        broadcastUsers(); // 🔥 po odhlášení aktualizuj seznam
      }
      return;
    }

    // Forward messages (chat, call, ICE...)
    const forwardTypes = new Set([
      'message',
      'image',
      'call-offer',
      'call-answer',
      'ice-candidate'
    ]);

    if (forwardTypes.has(type)) {
      const { to } = msg;
      const target = users.get(to);
      if (target && target.ws && target.ws.readyState === 1) {
        try { target.ws.send(JSON.stringify(msg)); } catch {}
      }
      return;
    }
  });

  ws.on('close', () => {
    if (myName && users.has(myName)) {
      users.delete(myName);
      broadcastUsers(); // 🔥 po zavření aktualizuj seznam
      console.log(`Disconnected: ${myName}`);
    }
  });
});

