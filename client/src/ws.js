export function createSocket(url, onMessage) {
  const ws = new WebSocket(url)

  ws.onopen = () => {
    console.log("WS connected")
  }

  ws.onmessage = ev => {
    try {
      const data = JSON.parse(ev.data)
      onMessage(data)
    } catch (e) {
      console.error("Bad WS message", e)
    }
  }

  // ✨ přidáme helper
  ws.sendJSON = (obj) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(obj))
    } else {
      console.warn("WS not ready, cannot send", obj)
    }
  }

  return ws
}

