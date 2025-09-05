import React, { useEffect, useRef, useState } from 'react'
import { createSocket } from './ws.js'
import { generateIdentity, deriveSharedKey } from './crypto.js'
import Chat from './Chat.jsx'
import VideoCall from './VideoCall.jsx'

const WS_URL = (import.meta.env.VITE_WS_URL) || 'wss://apka-1.onrender.com'

export default function App() {
  const [username, setUsername] = useState('')          // uložené jméno po přihlášení
  const [inputName, setInputName] = useState('')        // dočasný input
  const [me, setMe] = useState(null)                    // { privateKey, publicKeyJwk }
  const [users, setUsers] = useState([])                // [{username, publicKeyJwk}]
  const [activePeer, setActivePeer] = useState(null)    // username
  const [sharedKeys, setSharedKeys] = useState(new Map()) // peer -> CryptoKey

  const socketRef = useRef(null)

  useEffect(() => {
    (async () => {
      const id = await generateIdentity()
      setMe(id)
    })()
  }, [])

  function connect(uname) {
    if (!me) return
    const s = createSocket(WS_URL, onMessage)
    socketRef.current = s
    s.send('register', { username: uname, publicKeyJwk: me.publicKeyJwk })
    setUsername(uname) // přihlášení
  }

  function onMessage(data) {
  if (data.type === 'users') {
    if (username) {
      setUsers(data.users.filter(u => u.username !== username))
    } else {
      setUsers(data.users) 
    }
  }
}


  async function openChatWith(peerName) {
    const peer = users.find(u => u.username === peerName)
    if (!peer) return
    if (!sharedKeys.has(peerName)) {
      const key = await deriveSharedKey(me.privateKey, peer.publicKeyJwk)
      setSharedKeys(new Map(sharedKeys.set(peerName, key)))
    }
    setActivePeer(peerName)
  }

  function logout() {
    try { socketRef.current?.send('logout') } catch {}
    setUsername('')
    setActivePeer(null)
  }

  return (
    <div className="container">
      <div className="card">
        {!username ? (
          <div style={{display:'grid', gap:12}}>
            <h2>👋 E2EE Chat + Video</h2>
            <input
              className="input accent"
              placeholder="Zadej jméno (např. alena)"
              value={inputName}
              onChange={e=>setInputName(e.target.value.trim())}
            />
            <button
              className="button"
              onClick={()=>connect(inputName)}
              disabled={!me || !inputName}
            >
              Připojit
            </button>
            {!me && <small>Generuji lokální klíče…</small>}
          </div>
        ) : (
          <div className="row">
            <aside className="card">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <h3>Uživatelé</h3>
                <button className="button" onClick={logout}>Odhlásit</button>
              </div>
              <div className="list">
                {users.length === 0 && <div className="badge">Nikdo není online</div>}
                {users.map(u => (
                  <div key={u.username} className="user" onClick={()=>openChatWith(u.username)}>
                    <div>
                      <strong>{u.username}</strong>
                      <div className="badge">E2EE připraveno</div>
                    </div>
                    <div>💬📹</div>
                  </div>
                ))}
              </div>
            </aside>
            <main className="card">
              {!activePeer ? (
                <div className="badge">Vyber si vlevo uživatele</div>
              ) : (
                <Tabs
                  chat={<Chat me={username} peer={activePeer} socket={socketRef.current} getKey={(p)=>sharedKeys.get(p)} />}
                  video={<VideoCall me={username} peer={activePeer} socket={socketRef.current} />}
                />
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  )
}

function Tabs({ chat, video }) {
  const [tab, setTab] = useState('chat')
  return (
    <div>
      <div className="tabs">
        <div className={`tab ${tab==='chat'?'active':''}`} onClick={()=>setTab('chat')}>Chat</div>
        <div className={`tab ${tab==='video'?'active':''}`} onClick={()=>setTab('video')}>Video</div>
      </div>
      {tab === 'chat' ? chat : video}
    </div>
  )
}

