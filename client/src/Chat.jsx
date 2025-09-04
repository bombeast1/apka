import React, { useEffect, useRef, useState } from 'react'
import { encryptString, decryptToString, encryptBytes, decryptToBytes } from './crypto.js'

export default function Chat({ me, peer, socket, getKey }) {
  const [log, setLog] = useState([]) // {from, kind: 'text'|'image', text? , url?}
  const [input, setInput] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    function onMessage(ev) {
      const data = ev.detail
    }
  }, [])

  useEffect(() => {
    function handle(data) {
      if (data.type === 'message' && data.to === me && data.from === peer) {
        receiveText(data.payload)
      }
      if (data.type === 'image' && data.to === me && data.from === peer) {
        receiveImage(data.payload)
      }
    }
    const listener = (ev) => handle(ev.detail)
    window.addEventListener('ws-message', listener)
    return () => window.removeEventListener('ws-message', listener)
  }, [me, peer])

  // Monkey-patch socket to dispatch events globally so multiple components can listen
  useEffect(() => {
    if (!socket) return
    if (socket.__patched) return
    socket.ws.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data)
        const evt = new CustomEvent('ws-message', { detail: data })
        window.dispatchEvent(evt)
      } catch {}
    })
    socket.__patched = true
  }, [socket])

  async function receiveText({ cipher, iv }) {
    try {
      const key = getKey(peer)
      const text = await decryptToString(cipher, iv, key)
      setLog(l => [...l, { from: peer, kind: 'text', text }])
    } catch (e) {
      console.error('Decrypt text failed', e)
    }
  }

  async function receiveImage({ cipher, iv }) {
    try {
      const key = getKey(peer)
      const buf = await decryptToBytes(cipher, iv, key)
      const blob = new Blob([buf])
      const url = URL.createObjectURL(blob)
      setLog(l => [...l, { from: peer, kind: 'image', url }])
    } catch (e) {
      console.error('Decrypt image failed', e)
    }
  }

  async function sendText() {
    if (!input) return
    const key = getKey(peer)
    const payload = await encryptString(input, key)
    socket.send('message', { from: me, to: peer, payload })
    setLog(l => [...l, { from: me, kind:'text', text: input }])
    setInput('')
  }

  async function sendImage(file) {
    if (!file) return
    const buf = await file.arrayBuffer()
    const key = getKey(peer)
    const payload = await encryptBytes(buf, key)
    socket.send('image', { from: me, to: peer, payload })
    setLog(l => [...l, { from: me, kind:'image', url: URL.createObjectURL(file) }])
    fileRef.current.value = ''
  }

  return (
    <div className="chatArea">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h3>Chat s {peer}</h3>
      </div>
      <div className="bubbles">
        {log.map((m, i) => (
          <div key={i} className={`bubble ${m.from===me?'me':''}`}>
            {m.kind === 'text' ? (
              <span>{m.text}</span>
            ) : (
              <img src={m.url} alt="img" style={{maxWidth:'100%', borderRadius:8}}/>
            )}
          </div>
        ))}
      </div>
      <div className="toolbar">
        <input className="input" placeholder="Napiš zprávu…" value={input}
               onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendText()}/>
        <button className="button" onClick={sendText}>Odeslat</button>
        <input type="file" className="file" accept="image/*" ref={fileRef}
               onChange={e=>sendImage(e.target.files?.[0])}/>
      </div>
    </div>
  )
}
