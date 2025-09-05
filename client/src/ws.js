// client/src/ws.js
export function createSocket(url, onMessage) {
  const ws = new WebSocket(url);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage?.(data);
    } catch {}
  };
  ws.sendJSON = (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));
  return ws;
}

