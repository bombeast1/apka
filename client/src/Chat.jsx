import React, { useEffect, useRef, useState } from 'react'
import { appendHistory, getHistory } from './storage.js'
import { encryptJSON, decryptJSON } from './crypto.js'

export default function Chat({ me, peer, socket, getKey, isGroup=false, getGroupMembers, tick=0 }) {
  const [text, setText] = useState('')
  const [items, setItems] = useState([])
  const fileRef = useRef(null)

  // načtení historie
  useEffect(() => {
    setItems(getHistory(me, peer));
  }, [me, peer, tick]);

  function pushLocal(msg) {
    appendHistory(me, peer, msg);
    setItems(prev => [...prev, { t: Date.now(), ...msg }]);
  }

  async function sendText() {
  if (!text.trim()) return;

  // čistý identifikátor pro "to"
  const target = isGroup ? peer.replace('group:', '') : peer;

  const key = await getKey(isGroup ? me : peer); 
  const payload = await encryptJSON(key, { kind:'text', text });

  socket?.sendJSON({ type:'message', to: target, from: me, payload });
  pushLocal({ from: me, to: peer, inbound:false, data:{ kind:'text', text } });

  setText('');
}

async function sendImage(file) {
  const arr = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(arr)));

  // čistý identifikátor pro "to"
  const target = isGroup ? peer.replace('group:', '') : peer;

  const key = await getKey(isGroup ? me : peer); 
  const payload = await encryptJSON(key, { kind:'image', name:file.name, b64 });

  socket?.sendJSON({ type:'image', to: target, from: me, payload });
  pushLocal({ from: me, to: peer, inbound:false, data:{ kind:'image', name:file.name, b64 } });
}

  return (
    <div style={{display:'grid', gap:12}}>
      <div className="messages">
        {items.map((msg, idx) => {
          const inbound = !!msg.inbound;
          const data = msg.data;
          return (
            <div key={idx} className={`row ${inbound?'left':'right'}`}>
              <div className={`bubble ${inbound?'in':'out'}`}>
                {data?.kind === 'image'
                  ? <img alt={data.name||'img'} src={`data:image/*;base64,${data.b64}`} style={{maxWidth:'240px', borderRadius:8}}/>
                  : <span>{data?.text}</span>
                }
              </div>
            </div>
          )
        })}
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
