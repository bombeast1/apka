import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createSocket } from './ws.js'
import { generateIdentity, deriveSharedKey } from './crypto.js'
import Chat from './Chat.jsx'
import VideoCall from './VideoCall.jsx'
import { appendHistory, getHistory, saveGroups, loadGroups, setLastLogin, getLastLogin } from './storage.js'

const WS_URL = (import.meta.env.VITE_WS_URL) || 'wss://apka-1.onrender.com'

export default function App() {
  // AUTH
  const [stage, setStage] = useState('auth') // 'auth' | 'app'
  const [loginName, setLoginName] = useState(getLastLogin())
  const [loginPass, setLoginPass] = useState('')
  const [username, setUsername] = useState('')
  // CRYPTO
  const [me, setMe] = useState(null) // { privateKey, publicKeyJwk }
  // ONLINE
  const [users, setUsers] = useState([]) // [{username, publicKeyJwk}]
  // GROUPS
  const [groups, setGroups] = useState(loadGroups()) // lokální snapshot
  const [activePeer, setActivePeer] = useState(null) // username nebo "group:xxx"
  const [sharedKeys, setSharedKeys] = useState(new Map()) // peer -> CryptoKey

  const socketRef = useRef(null)

  useEffect(() => {
    (async () => setMe(await generateIdentity()))()
  }, [])

  function ensureSocket() {
    if (socketRef.current && socketRef.current.readyState === 1) return socketRef.current;
    const s = createSocket(WS_URL, onMessage);
    socketRef.current = s;
    return s;
  }

  // --- AUTH (demo) ---
  function registerAccount() {
    const s = ensureSocket();
    s.sendJSON({ type:'registerAccount', username: loginName.trim(), password: loginPass });
  }
  function login() {
    const s = ensureSocket();
    s.sendJSON({ type:'login', username: loginName.trim(), password: loginPass, publicKeyJwk: me?.publicKeyJwk || null });
  }

  function onMessage(data) {
    if (data.type === 'auth') {
      if (data.phase === 'register') {
        // registrace ok/ne
        if (data.ok) {
          // po registraci hned login
          login();
        } else {
          alert('Registrace selhala: ' + (data.reason || ''));
        }
      }
      if (data.phase === 'login') {
        if (data.ok) {
          setUsername(data.username);
          setStage('app');
          setLastLogin(data.username);
        } else {
          alert('Špatné přihlášení');
        }
      }
      return;
    }

    if (data.type === 'users') {
      // když ještě neznáme username, nic nefiltruj
      setUsers(prev => (username ? data.users.filter(u => u.username !== username) : data.users));
      return;
    }

    if (data.type === 'groups') {
      setGroups(data.groups);
      saveGroups(data.groups);
      return;
    }

    if (data.type === 'message' || data.type === 'image') {
      // DM zpráva – uložit historii
      appendHistory(data.to === username ? data.from : username, data.to === username ? data.from : data.to, { inbound:true, ...data });
      return;
    }

    if (data.type === 'group-message') {
      // pro jednoduchost uložíme pod „peer“ = název skupiny
      appendHistory(username, `group:${data.group}`, { inbound:true, from:data.from, payload:data.payload });
      return;
    }

    // Signaling přebírá VideoCall komponenta (předáme socketRef)
  }

  async function openChatWith(peerName) {
    if (peerName.startsWith('group:')) {
      setActivePeer(peerName); // skupiny E2EE si můžeš řešit sdíleným group klíčem (na později)
      return;
    }
    const peer = users.find(u => u.username === peerName);
    if (!peer) return;
    if (!sharedKeys.has(peerName)) {
      const key = await deriveSharedKey(me.privateKey, peer.publicKeyJwk);
      setSharedKeys(new Map(sharedKeys.set(peerName, key)));
    }
    setActivePeer(peerName);
  }

  function logout() {
    try { socketRef.current?.sendJSON({ type:'logout' }) } catch {}
    setStage('auth');
    setUsername('');
    setActivePeer(null);
  }

  if (stage === 'auth') {
    return (
      <div className="container">
        <div className="card" style={{display:'grid', gap:12, maxWidth:420, margin:'40px auto'}}>
          <h2>🔐 Přihlášení / Registrace</h2>
          <input className="input" placeholder="Uživatelské jméno" value={loginName} onChange={e=>setLoginName(e.target.value.trim())}/>
          <input className="input" type="password" placeholder="Heslo" value={loginPass} onChange={e=>setLoginPass(e.target.value)} />
          <div style={{display:'flex', gap:8}}>
            <button className="button" disabled={!loginName || !loginPass || !me} onClick={login}>Přihlásit</button>
            <button className="button" disabled={!loginName || !loginPass || !me} onClick={registerAccount}>Registrovat</button>
          </div>
          {!me && <small>Generuji lokální klíče…</small>}
        </div>
      </div>
    );
  }

  // stage === 'app'
  const myDMs = users.map(u => u.username);
  const myGroups = groups.map(g => `group:${g.name}`);

  return (
    <div className="container">
      <div className="card">
        <div className="row">
          <aside className="card" style={{minWidth:280}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h3>{username} · Uživatelé</h3>
              <button className="button" onClick={logout}>Odhlásit</button>
            </div>

            <div className="list">
              {myDMs.length === 0 && <div className="badge">Nikdo není online</div>}
              {myDMs.map(u => (
                <div key={u} className="user" onClick={()=>openChatWith(u)}>
                  <div><strong>{u}</strong><div className="badge">E2EE připraveno</div></div>
                  <div>💬📹</div>
                </div>
              ))}
            </div>

            <h4 style={{marginTop:16}}>Skupiny</h4>
            <div className="list">
              {myGroups.map(g => (
                <div key={g} className="user" onClick={()=>setActivePeer(g)}>
                  <div><strong>{g.replace('group:','')}</strong><div className="badge">Skupina</div></div>
                  <div>💬</div>
                </div>
              ))}
            </div>

            <GroupControls socket={ensureSocket} />
          </aside>

          <main className="card">
            {!activePeer ? (
              <div className="badge">Vyber vlevo uživatele nebo skupinu</div>
            ) : activePeer.startsWith('group:') ? (
              <Chat
                me={username}
                peer={activePeer}             // „group:xyz“
                socket={socketRef.current}
                getKey={()=>null}             // (jednoduše – group E2EE může být až další krok)
                isGroup
              />
            ) : (
              <Tabs
                chat={<Chat me={username} peer={activePeer} socket={socketRef.current} getKey={(p)=>sharedKeys.get(p)} />}
                video={<VideoCall me={username} peer={activePeer} socket={socketRef.current} />}
              />
            )}
          </main>
        </div>
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
        <div className={`tab ${tab==='video'?'active':''}`} onClick={()=>setTab('video')}>Video/Audio</div>
      </div>
      {tab === 'chat' ? chat : video}
    </div>
  )
}

function GroupControls({ socket }) {
  const [name, setName] = useState('');
  const s = socket();
  return (
    <div style={{display:'grid', gap:8, marginTop:8}}>
      <input className="input" placeholder="Název skupiny" value={name} onChange={e=>setName(e.target.value.trim())}/>
      <div style={{display:'flex', gap:8}}>
        <button className="button" disabled={!name} onClick={()=>s.sendJSON({ type:'create-group', name })}>Vytvořit</button>
        <button className="button" disabled={!name} onClick={()=>s.sendJSON({ type:'join-group', name })}>Připojit se</button>
      </div>
    </div>
  )
}
