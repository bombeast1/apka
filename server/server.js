import express from 'express'
import { WebSocketServer } from 'ws'
import http from 'http'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const app = express()
const PORT = process.env.PORT || 8080
const server = http.createServer(app)

const accounts = new Map()     // username -> { salt, passHashHex }
const online = new Map()       // username -> { ws, publicKeyJwk }
const groups = new Map()       // groupName -> Set(usernames)

function hashPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex')
  const hash = scryptSync(password, salt, 64)
  return hash.toString('hex')
}
function createAccount(username, password) {
  if (accounts.has(username)) return { ok:false, reason:'USER_EXISTS' }
  const salt = randomBytes(16).toString('hex')
  const passHashHex = hashPassword(password, salt)
  accounts.set(username, { salt, passHashHex })
  return { ok:true }
}
function verifyLogin(username, password) {
  const rec = accounts.get(username)
  if (!rec) return false
  const hashHex = hashPassword(password, rec.salt)
  const a = Buffer.from(hashHex, 'hex')
  const b = Buffer.from(rec.passHashHex, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function broadcastUsers() {
  const list = Array.from(online.entries()).map(([name, info]) => ({
    username: name,
    publicKeyJwk: info.publicKeyJwk || null
  }))
  const payload = JSON.stringify({ type:'users', users:list })
  for (const [, info] of online) {
    try { info.ws.send(payload) } catch {}
  }
}
function broadcastGroups() {
  const list = Array.from(groups.entries()).map(([g, set]) => ({
    name: g,
    members: Array.from(set)
  }))
  const payload = JSON.stringify({ type:'groups', groups:list })
  for (const [, info] of online) {
    try { info.ws.send(payload) } catch {}
  }
}

const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  let myName = null

  ws.on('message', (buf) => {
    let msg
    try { msg = JSON.parse(buf.toString()) } catch { return }
    const { type } = msg

    if (type === 'registerAccount') {
      const { username, password } = msg
      const uname = String(username || '').trim()
      if (!uname || !password) return ws.send(JSON.stringify({ type:'auth', ok:false, reason:'BAD_INPUT' }))
      const r = createAccount(uname, password)
      return ws.send(JSON.stringify({ type:'auth', phase:'register', ...r }))
    }

    if (type === 'login') {
      const { username, password, publicKeyJwk } = msg
      const uname = String(username || '').trim()
      if (!uname || !password) return ws.send(JSON.stringify({ type:'auth', ok:false, reason:'BAD_INPUT' }))
      if (!verifyLogin(uname, password)) {
        return ws.send(JSON.stringify({ type:'auth', phase:'login', ok:false, reason:'INVALID_CREDENTIALS' }))
      }
      myName = uname
      online.set(myName, { ws, publicKeyJwk: publicKeyJwk || null })
      ws.send(JSON.stringify({ type:'auth', phase:'login', ok:true, username: myName }))
      broadcastUsers()
      broadcastGroups()
      return
    }

    if (type === 'logout') {
      if (myName && online.has(myName)) {
        online.delete(myName)
        broadcastUsers()
      }
      return
    }

    if (!myName) return

    if (type === 'updatePublicKey') {
      const { publicKeyJwk } = msg
      const rec = online.get(myName)
      if (rec) rec.publicKeyJwk = publicKeyJwk || null
      broadcastUsers()
      return
    }

    if (['message','image','call-offer','call-answer','ice-candidate','hangup'].includes(type)) {
      const { to, from, payload } = msg
      console.log("📩 Server received:", msg)

      if (online.has(to)) {
        const target = online.get(to)
        if (target?.ws?.readyState === 1) {
          target.ws.send(JSON.stringify({ type, from, to, payload }))
        }
      }

      if (groups.has(to)) {
        for (const member of groups.get(to)) {
          if (member === from) continue
          const target = online.get(member)
          if (target?.ws?.readyState === 1) {
            target.ws.send(JSON.stringify({ type, from, to, payload }))
          }
        }
      }
      return
    }

    if (type === 'create-group') {
      const g = String(msg.name || '').trim()
      if (!g) return
      if (!groups.has(g)) groups.set(g, new Set())
      groups.get(g).add(myName)
      broadcastGroups()
      return
    }
    if (type === 'join-group') {
      const g = String(msg.name || '').trim()
      if (!g || !groups.has(g)) return
      groups.get(g).add(myName)
      broadcastGroups()
      return
    }
    if (type === 'leave-group') {
      const g = String(msg.name || '').trim()
      if (!g || !groups.has(g)) return
      groups.get(g).delete(myName)
      broadcastGroups()
      return
    }
  })

  ws.on('close', () => {
    if (myName && online.has(myName)) {
      online.delete(myName)
      broadcastUsers()
    }
  })
})

server.listen(PORT, () => {
  console.log('✅ WS signaling server listening on :' + PORT)
})
