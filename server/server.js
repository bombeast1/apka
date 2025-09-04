import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = process.env.PORT || 8080;

const server = app.listen(PORT, () => {
  console.log(`WS signaling server listening on :${PORT}`);
});

// In-memory registry: username -> { ws, publicKeyJwk }
const users = new Map();

// Broadcast user list to everyone
function broadcastUsers() {
  const list = Array.from(users.entries()).map(([name, info]) => ({
    username: name,
    publicKeyJwk: info.publicKeyJwk
  }));
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
      broadcastUsers();
      return;
    }

    if (type === 'logout') {
      if (myName && users.has(myName)) {
        users.delete(myName);
        broadcastUsers();
      }
      return;
    }

    // Pass-through helpers
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
      broadcastUsers();
      console.log(`Disconnected: ${myName}`);
    }
  });
});
