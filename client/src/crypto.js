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
    false,
    []
  );
}

export async function deriveSharedKey(privateKey, peerPublicJwk) {
  const peerPub = await importPeerPublicKey(peerPublicJwk);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPub },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return aesKey;
}

// --- Text encryption helpers ---

export async function encryptString(plainText, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  return { iv: bufToB64(iv.buffer), cipher: bufToB64(cipher) };
}

export async function decryptToString(cipherB64, ivB64, aesKey) {
  const cipher = b64ToBuf(cipherB64);
  const iv = new Uint8Array(b64ToBuf(ivB64));
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipher);
  return new TextDecoder().decode(plainBuf);
}

// --- Binary (image) helpers ---

export async function encryptBytes(arrayBuffer, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, arrayBuffer);
  return { iv: bufToB64(iv.buffer), cipher: bufToB64(cipher) };
}

export async function decryptToBytes(cipherB64, ivB64, aesKey) {
  const cipher = b64ToBuf(cipherB64);
  const iv = new Uint8Array(b64ToBuf(ivB64));
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, cipher);
  return plainBuf;
}

// --- Base64 helpers for ArrayBuffer ---

export function bufToB64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunk = 0x8000;
  for (let i = 0; i < len; i += chunk) {
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
