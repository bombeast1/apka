// client/src/ws.js
export function createSocket(url, onMessage) {
  const ws = new WebSocket(url);
  ws.onopen = () => console.log('WS connected');
  ws.onclose = () => console.log('WS closed');
  ws.onerror = (e) => console.log('WS error', e);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage?.(data);
    } catch {}
  };
  ws.sendJSON = (obj) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };
  return ws;
}

