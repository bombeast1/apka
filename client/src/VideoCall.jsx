import React, { useEffect, useRef, useState } from 'react'

export default function VideoCall({ me, peer, socket }) {
  const pcRef = useRef(null);
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const [inCall, setInCall] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (e) => {
      let data; try { data = JSON.parse(e.data); } catch { return; }
      if (!data) return;

      if (data.type === 'call-offer' && data.to === me) {
        // místo automatického přijetí nabídneme vyzvánění
        const accept = window.confirm(`📞 Příchozí hovor od ${data.from}. Chceš přijmout?`);
        if (accept) {
          acceptOffer(data.offer, data.from, data.mode === 'audio');
        } else {
          socket?.send(JSON.stringify({ type: 'hangup', to: data.from, from: me }));
        }
      }

      if (data.type === 'call-answer' && data.to === me) {
        pcRef.current?.setRemoteDescription(data.answer);
      }

      if (data.type === 'ice-candidate' && data.to === me) {
        pcRef.current?.addIceCandidate(data.candidate).catch(() => { });
      }

      if (data.type === 'hangup' && data.to === me) {
        endCall();
        alert(`❌ Hovor ukončen uživatelem ${data.from}`);
      }
    };
    socket.addEventListener('message', onMsg);
    return () => socket.removeEventListener('message', onMsg);
  }, [socket, me]);

  async function setupPeer(audioOnlyMode = false) {
    // přidaný TURN server
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    });
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socket?.send(JSON.stringify({
          type: 'ice-candidate',
          to: peer,
          from: me,
          candidate: ev.candidate
        }));
      }
    };

    pc.ontrack = (ev) => {
      if (remoteRef.current) remoteRef.current.srcObject = ev.streams[0];
    };

    const stream = await navigator.mediaDevices.getUserMedia(
      audioOnlyMode ? { audio: true, video: false } : { audio: true, video: true }
    );
    if (localRef.current) localRef.current.srcObject = stream;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    return pc;
  }

  async function startCall() {
    const pc = await setupPeer(audioOnly);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setInCall(true);
    socket?.send(JSON.stringify({
      type: 'call-offer',
      to: peer,
      from: me,
      offer,
      mode: audioOnly ? 'audio' : 'video'
    }));
  }

  async function acceptOffer(offer, from, audioOnlyMode = false) {
    setAudioOnly(!!audioOnlyMode);
    const pc = await setupPeer(!!audioOnlyMode);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    setInCall(true);
    socket?.send(JSON.stringify({ type: 'call-answer', to: from, from: me, answer }));
  }

  function endCall() {
    setInCall(false);
    if (pcRef.current) {
      pcRef.current.getSenders().forEach(s => s.track && s.track.stop());
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localRef.current?.srcObject) {
      localRef.current.srcObject.getTracks().forEach(t => t.stop());
      localRef.current.srcObject = null;
    }
    if (remoteRef.current?.srcObject) {
      remoteRef.current.srcObject.getTracks().forEach(t => t.stop());
      remoteRef.current.srcObject = null;
    }
    socket?.send(JSON.stringify({ type: 'hangup', to: peer, from: me }));
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <video ref={localRef} autoPlay playsInline muted style={{ width: 240, background: '#000', borderRadius: 8 }} />
        <video ref={remoteRef} autoPlay playsInline style={{ width: 240, background: '#000', borderRadius: 8 }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={audioOnly} onChange={e => setAudioOnly(e.target.checked)} />
          Jen audio hovor
        </label>

        {!inCall ? (
          <button className="button" onClick={startCall}>Zahájit hovor</button>
        ) : (
          <button className="button" onClick={endCall}>Ukončit</button>
        )}
      </div>
      <small>Tip: pro WebRTC je potřeba HTTPS a povolený mikrofon/kamera.</small>
    </div>
  )
}

