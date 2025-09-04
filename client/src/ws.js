// Minimal WebSocket wrapper
export function createSocket(url, onMessage) {
  const ws = new WebSocket(url);
  ws.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      onMessage?.(data);
    } catch {}
  });
  return {
    ws,
    send(type, payload = {}) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, ...payload }));
      } else {
        ws.addEventListener('open', () => {
          ws.send(JSON.stringify({ type, ...payload }));
        }, { once: true });
      }
    }
  };
}
