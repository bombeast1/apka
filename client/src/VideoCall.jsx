import React, { useEffect, useRef, useState } from 'react'

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
}

export default function VideoCall({ me, peer, socket }) {
  const [status, setStatus] = useState('idle') // idle | calling | in-call
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)

  useEffect(() => {
    const onWs = (ev) => {
      const data = ev.detail
      if (data.to !== me || data.from !== peer) return

      if (data.type === 'call-offer') onOffer(data)
      if (data.type === 'call-answer') onAnswer(data)
      if (data.type === 'ice-candidate') onIce(data)
    }
    window.addEventListener('ws-message', onWs)
    return () => window.removeEventListener('ws-message', onWs)
  }, [me, peer])

  async function ensurePC() {
    if (pcRef.current) return pcRef.current
    const pc = new RTCPeerConnection(rtcConfig)
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.send('ice-candidate', { from: me, to: peer, candidate: e.candidate })
      }
    }
    pc.ontrack = (e) => {
      remoteVideoRef.current.srcObject = e.streams[0]
    }
    pcRef.current = pc
    return pc
  }

  async function getLocalStream() {
    if (localStreamRef.current) return localStreamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localStreamRef.current = stream
    localVideoRef.current.srcObject = stream
    return stream
  }

  async function startCall() {
    setStatus('calling')
    const pc = await ensurePC()
    const stream = await getLocalStream()
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socket.send('call-offer', { from: me, to: peer, sdp: offer })
  }

  async function onOffer({ sdp }) {
    const pc = await ensurePC()
    const stream = await getLocalStream()
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    socket.send('call-answer', { from: me, to: peer, sdp: answer })
    setStatus('in-call')
  }

  async function onAnswer({ sdp }) {
    const pc = await ensurePC()
    await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    setStatus('in-call')
  }

  async function onIce({ candidate }) {
    try {
      await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (e) {
      console.error('addIceCandidate failed', e)
    }
  }

  function hangup() {
    try { pcRef.current?.close() } catch {}
    pcRef.current = null
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    localVideoRef.current.srcObject = null
    remoteVideoRef.current.srcObject = null
    setStatus('idle')
  }

  return (
    <div style={{display:'grid', gap:12}}>
      <h3>Video s {peer}</h3>
      <div className="videoWrap">
        <video ref={localVideoRef} autoPlay muted playsInline />
        <video ref={remoteVideoRef} autoPlay playsInline />
      </div>
      <div className="toolbar">
        <button className="button" onClick={startCall} disabled={status!=='idle'}>Start Call</button>
        <button className="button" onClick={hangup} disabled={status==='idle'}>Hang up</button>
      </div>
    </div>
  )
}
