import React, { useEffect, useRef, useState } from 'react'
import { createSocket } from './ws.js'
import { generateIdentity, deriveSharedKey, decryptJSON } from './crypto.js';
import Chat from './Chat.jsx'
import VideoCall from './VideoCall.jsx'
import { appendHistory, saveGroups, loadGroups, setLastLogin, getLastLogin } from './storage.js'

const WS_URL = (import.meta.env.VITE_WS_URL) || 'wss://apka-1.onrender.com'
//hello there
export default function App() {
  // AUTH
  const [stage, setStage] = useState('auth')
  const [loginName, setLoginName] = useState(getLastLogin())
  const [loginPass, setLoginPass] = useState('')
  const [username, setUsername] = useState('')

  // CRYPTO
  const [me, setMe] = useState(null) // { privateKey, publicKeyJwk }

  // ONLINE + GROUPS
  const [users, setUsers] = useState([]) // [{username, publicKeyJwk}]
  const [groups, setGroups] = useState(loadGroups()) // [{name, members:[]}]
  const [activePeer, setActivePeer] = useState(null) // 'bob' nebo 'group:team'

  // Keys cache
  const [sharedKeys] = useState(new Map())
  const [historyTick, setHistoryTick] = useState(0)

  const socketRef = useRef(null)

  useEffect(() => { (async () => { const id = await generateIdentity(); setMe(id); })(); }, [])

  function ensureSocket() {
    if (socketRef.current && socketRef.current.readyState === 1) return socketRef.current
    const ws = createSocket(WS_URL, onMessage)
    socketRef.current = ws
    return ws
  }

function onMessage(data) {
  console.log("Received WS message:", data);
  
  // 📌 přihlášení / registrace
  if (data.type === "auth") {
    if (data.ok && data.phase === "login") {
      setUsername(data.username);
      setStage("app");
      setLastLogin(data.username);
    } else {
      alert("Přihlášení/registrace selhalo");
    }
    return;
  }
if (data.type === "auth" && data.phase === "login" && data.ok) {
    setUsername(data.username);   // ✅ uložíme jméno přihlášeného
    setStage("app");
    setLastLogin(data.username);
    return;
  }
  // 📌 seznam online uživatelů
  if (data.type === "users") {
    setUsers(data.users || []);
    return;
  }

  // 📌 seznam skupin
  if (data.type === "groups") {
    setGroups(data.groups || []);
    saveGroups(data.groups || []); // volitelné – uloží lokálně
    return;
  }

  // 📌 příchozí zprávy (DM i group)
  if (
    data.type === "message" ||
    data.type === "image" ||
    data.type === "group-message"
  ) {
    const from = data.from;
    const payload = data.payload;
    const fromKey = data.fromKey || null;

    const peer =
      data.type === "group-message" && data.group
        ? `group:${String(data.group)}`
        : from;

    decryptAndStore(peer, payload, fromKey);
    return;
  }

  // 📌 fallback - pro debug
  console.warn("Unhandled WS message type:", data.type, data);
}



  // 🔑 decrypt + save
async function decryptAndStore(from, payload, fromKey) {
  try {
    const key = await getKey(from, fromKey);
    const clear = await decryptJSON(key, payload);

      const peerId = from;   // protistrana
    const meId = to;       // já, příjemce zprávy

    console.log('[DEBUG] storing incoming message', { meId, peerId, clear });

    appendHistory(meId, peerId, {
      from,
      to: meId,
      inbound: true,
      data: clear
    });
    setHistoryTick(t => t + 1);
  } catch (err) {
    console.error('decrypt fail', err);
  }
}





 async function getKey(peerName, overrideJwk) {
  if (sharedKeys.has(peerName)) return sharedKeys.get(peerName);

  // 1) zkus najít v users
  let peer = users.find(u => u.username === peerName);

  // 2) pokud není v users nebo nemá klíč, zkus override z přijaté zprávy
  const publicKeyJwk = peer?.publicKeyJwk || overrideJwk;
  if (!publicKeyJwk || !me?.privateKey) throw new Error('Missing keys');

  const key = await deriveSharedKey(me.privateKey, publicKeyJwk);
  sharedKeys.set(peerName, key);
  return key;
}


  // --- AUTH actions ---
  function login() {
    const uname = (loginName || '').trim()
    if (!uname || !loginPass || !me) return
    const s = ensureSocket()
    s.sendJSON({ type:'login', username: uname, password: loginPass, publicKeyJwk: me.publicKeyJwk })
  }
  function registerAccount() {
    const uname = (loginName || '').trim()
    if (!uname || !loginPass) return
    const s = ensureSocket()
    s.sendJSON({ type:'registerAccount', username: uname, password: loginPass })
  }
  function logout() {
    try { socketRef.current?.sendJSON({ type:'logout' }) } catch {}
    setStage('auth'); setUsername(''); setActivePeer(null)
  }

  // --- UI helpers ---
  function openDM(peerName) {
    if (!peerName) return
    setActivePeer(peerName)
  }
  function openGroup(name) {
    setActivePeer('group:'+name)
  }
  function getGroupMembers(name) {
    const g = groups.find(g => g.name === name)
    return g ? g.members : []
  }

  if (stage === 'auth') {
    return (
      <div className="container">
        <div className="card" style={{display:'grid', gap:12, maxWidth:420, margin:'40px auto'}}>
          <h2>🔐 Přihlášení / Registrace</h2>
          <input className="input" placeholder="Uživatelské jméno" value={loginName} onChange={e=>setLoginName(e.target.value.trim())}/>
          <input className="input" type="password" placeholder="Heslo" value={loginPass} onChange={e=>setLoginPass(e.target.value)}/>
          <div style={{display:'flex', gap:8}}>
            <button className="button" disabled={!loginName || !loginPass || !me} onClick={login}>Přihlásit</button>
            <button className="button" disabled={!loginName || !loginPass} onClick={registerAccount}>Registrovat</button>
          </div>
          {!me && <small>Generuji lokální klíče…</small>}
        </div>
      </div>
    )
  }

  // stage === 'app'
  return (
    <div className="container">
      <div className="card">
        <div className="row">
          <aside className="card" style={{minWidth:260}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <h3>Uživatelé</h3>
              <button className="button" onClick={logout}>Odhlásit</button>
            </div>

            <div className="list">
              {users.length === 0 && <div className="badge">Nikdo není online</div>}
              {users.map(u => (
                <div key={u.username} className="user" onClick={()=>openDM(u.username)}>
                  <div><strong>{u.username}</strong><div className="badge">E2EE</div></div>
                  <div>💬📞</div>
                </div>
              ))}
            </div>

            <h3>Skupiny</h3>
            <div className="list">
              {groups.length === 0 && <div className="badge">Zatím žádné skupiny</div>}
              {groups.map(g => (
                <div key={g.name} className="user" onClick={()=>openGroup(g.name)}>
                  <div><strong>{g.name}</strong><div className="badge">{g.members.length} členů</div></div>
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
                peer={activePeer}
                socket={socketRef.current}
                getKey={getKey}
                isGroup={true}
                getGroupMembers={getGroupMembers}
                tick={historyTick}
              />
            ) : (
              <Tabs
                chat={<Chat me={username} peer={activePeer} socket={socketRef.current} getKey={getKey} tick={historyTick} />}
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
        <div className={`tab ${tab==='video'?'active':''}`} onClick={()=>setTab('video')}>Hovor</div>
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
