import React, { useEffect, useRef, useState } from 'react'

const TURN_URL = import.meta.env.VITE_TURN_URL;
const TURN_USER = import.meta.env.VITE_TURN_USER;
const TURN_PASS = import.meta.env.VITE_TURN_PASS;

function buildIceServers() {
  const list = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (TURN_URL && TURN_USER && TURN_PASS) {
    list.push({ urls: TURN_URL, username: TURN_USER, credential: TURN_PASS });
  }
  return list;
}

export default function VideoCall({ me, peer, socket, audioOnlyDefault=false }) {
  const pcRef = useRef(null);
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const [inCall, setInCall] = useState(false);
  const [audioOnly, setAudioOnly] = useState(!!audioOnlyDefault);
  const [ringing, setRinging] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onMsg = async (e) => {
      let data; try { data = JSON.parse(e.data); } catch { return; }
      if (!data) return;
      if (data.to !== me) return;

      if (data.type === 'ring') {
        setRinging(true);
        return;
      }
      if (data.type === 'ring-stop') {
        setRinging(false);
        return;
      }

      if (data.type === 'call-offer') {
        const accept = confirm(`${data.from} vám volá. Přijmout?`);
        if (!accept) {
          socket?.send(JSON.stringify({ type:'hangup', to:data.from, from:me }));
          setRinging(false);
          return;
        }
        setRinging(false);
        await acceptOffer(data.offer, data.from, data.mode === 'audio');
      }
      if (data.type === 'call-answer') {
        await pcRef.current?.setRemoteDescription(data.answer);
      }
      if (data.type === 'ice-candidate') {
        try { await pcRef.current?.addIceCandidate(data.candidate); } catch {}
      }
      if (data.type === 'hangup') {
        endCall(false);
      }
    };
    socket.addEventListener('message', onMsg);
    return () => socket.removeEventListener('message', onMsg);
  }, [socket, me]);

  async function setupPeer(audioOnlyMode=false) {
    const pc = new RTCPeerConnection({ iceServers: buildIceServers() });
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socket?.send(JSON.stringify({ type:'ice-candidate', to: peer, from: me, candidate: ev.candidate }));
      }
    };
    pc.ontrack = (ev) => {
      if (remoteRef.current) remoteRef.current.srcObject = ev.streams[0];
    };

    const stream = await navigator.mediaDevices.getUserMedia(audioOnlyMode ? { audio:true, video:false } : { audio:true, video:true });
    if (localRef.current) localRef.current.srcObject = stream;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    return pc;
  }

  async function startCall() {
    socket?.send(JSON.stringify({ type:'ring', to: peer, from: me }));
    const pc = await setupPeer(audioOnly);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setInCall(true);
    socket?.send(JSON.stringify({ type:'call-offer', to: peer, from: me, offer, mode: audioOnly ? 'audio' : 'video' }));
  }

  async function acceptOffer(offer, from, audioOnlyMode=false) {
    setAudioOnly(!!audioOnlyMode);
    const pc = await setupPeer(!!audioOnlyMode);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    setInCall(true);
    socket?.send(JSON.stringify({ type:'call-answer', to: from, from: me, answer }));
  }

  function endCall(sendSignal = true) {
    setInCall(false);
    setRinging(false);
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(s => s.track && s.track.stop());
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (localRef.current?.srcObject) {
      localRef.current.srcObject.getTracks().forEach(t=>t.stop());
      localRef.current.srcObject = null;
    }
    if (remoteRef.current?.srcObject) {
      remoteRef.current.srcObject.getTracks().forEach(t=>t.stop());
      remoteRef.current.srcObject = null;
    }
    if (sendSignal) socket?.send(JSON.stringify({ type:'hangup', to: peer, from: me }));
  }

  return (
    <div style={{display:'grid', gap:12}}>
      <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
        <video ref={localRef} autoPlay playsInline muted style={{width:240, background:'#000', borderRadius:8}}/>
        <video ref={remoteRef} autoPlay playsInline style={{width:240, background:'#000', borderRadius:8}}/>
      </div>

      {ringing && <div className="badge">🔔 Vyzvání…</div>}

      <div style={{display:'flex', gap:8}}>
        <label style={{display:'flex', alignItems:'center', gap:6}}>
          <input type="checkbox" checked={audioOnly} onChange={e=>setAudioOnly(e.target.checked)} />
          Jen audio hovor
        </label>

        {!inCall ? (
          <button className="button" onClick={startCall}>Zahájit hovor</button>
        ) : (
          <button className="button" onClick={()=>endCall(true)}>Ukončit</button>
        )}
      </div>
      <small>Tip: pro WebRTC je potřeba HTTPS a (ideálně) TURN server. Lze nastavit přes VITE_TURN_URL / VITE_TURN_USER / VITE_TURN_PASS.</small>
    </div>
  )
}
