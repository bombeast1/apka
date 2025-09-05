import React, { useEffect, useRef, useState } from 'react'
import { appendHistory, getHistory } from './storage.js'

export default function Chat({ me, peer, socket, getKey, isGroup=false }) {
  const [text, setText] = useState('')
  const [items, setItems] = useState([]) // lokální render historie
  const fileRef = useRef(null)

  // Načti historii při mountu a když se změní peer
  useEffect(() => {
    setItems(getHistory(me, peer));
  }, [me, peer]);

  function pushLocal(msg) {
    appendHistory(me, peer, msg);
    setItems(prev => [...prev, { t:Date.now(), ...msg }]);
  }

  async function sendText() {
    if (!text) return;
    const payload = { type: isGroup ? 'group-message' : 'message',
      ...(isGroup ? { group: peer.replace('group:',''), payload: { kind:'text', text } } :
                    { to: peer, from: me, body: { kind:'text', text } })
    };
    socket?.send(JSON.stringify(payload));
    pushLocal(isGroup ? { inbound:false, from: me, payload:{kind:'text', text} } :
                        { inbound:false, to: peer, body:{kind:'text', text} });
    setText('');
  }

  async function sendImage(file) {
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const payload = { type: isGroup ? 'group-message' : 'image',
      ...(isGroup ? { group: peer.replace('group:',''), payload: { kind:'image', b64, name:file.name } } :
                    { to: peer, from: me, body: { kind:'image', b64, name:file.name } })
    };
    socket?.send(JSON.stringify(payload));
    pushLocal(isGroup ? { inbound:false, from: me, payload:{kind:'image', b64, name:file.name} } :
                        { inbound:false, to: peer, body:{kind:'image', b64, name:file.name} });
  }

  return (
    <div style={{display:'grid', gap:8}}>
      <div className="chatlog">
        {items.map((m, i) => {
          const inbound = m.inbound;
          const data = m.payload || m.body;
        return (
          <div key={i} className={`bubble ${inbound?'in':'out'}`}>
            {data?.kind === 'image'
              ? <img alt={data.name||'img'} src={`data:image/*;base64,${data.b64}`} style={{maxWidth:'240px', borderRadius:8}}/>
              : <span>{data?.text}</span>
            }
          </div>
        )})}
      </div>

      <div style={{display:'flex', gap:8}}>
        <input className="input" placeholder="Napiš zprávu…" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendText()}/>
        <button className="button" onClick={sendText}>Odeslat</button>
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files[0] && sendImage(e.target.files[0])}/>
        <button className="button" onClick={()=>fileRef.current?.click()}>📷 Obrázek</button>
      </div>
    </div>
  )
}
