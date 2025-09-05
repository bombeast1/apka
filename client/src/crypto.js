// client/src/crypto.js
// Simple E2EE helpers using WebCrypto (ECDH P-256 -> AES-GCM 256)

export async function generateIdentity() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { privateKey: keyPair.privateKey, publicKeyJwk };
}

export async function importPeerPublicKey(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

export async function deriveSharedKey(privateKey, peerPublicJwk) {
  const peerPub = await importPeerPublicKey(peerPublicJwk);
  return await crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPub },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt','decrypt']
  );
}

export async function encryptJSON(sharedKey, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    data
  );
  return { iv: bufToB64(iv), data: bufToB64(cipher) };
}

export async function decryptJSON(sharedKey, payload) {
  const iv = b64ToBuf(payload.iv);
  const data = b64ToBuf(payload.data);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    sharedKey,
    data
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

export function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, sub);
  }
  return btoa(binary);
}

export function b64ToBuf(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
