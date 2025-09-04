# E2EE Chat + WebRTC Video (JS/TS/React/Node)

Jednoduchá ukázková aplikace pro:
- Textový chat mezi uživateli (1:1)
- End‑to‑end šifrování zpráv a obrázků (AES‑GCM, klíč z ECDH P‑256)
- Posílání obrázků/fotek (šifrováno stejně jako text)
- Videohovory mezi uživateli (WebRTC, jednoduchý signaling přes WebSocket)
- Jednoduché UI (React, Vite) – desktop i mobil

> **Poznámka:** Jde o **výukový prototyp**. Neřeší úložiště, přetrvávající session, obnovu klíčů a produkční bezpečnost. Server je pouze „pošťák“ – zprávy nečte, jen předává.

---

## Jak spustit

### 1) Server (Node.js)

```bash
cd server
npm install
npm start
```
Server WebSocket poběží na `ws://localhost:8080`.

### 2) Klient (React + Vite)

```bash
cd client
npm install
npm run dev
```
Otevři adresu z konzole (typicky `http://localhost:5173`).

> Otestuj ve **dvou různých prohlížečích** nebo v anonymním okně: přihlas se různými jmény, jeden uživatel si vybere druhého a chatujete / voláte.

---

## Struktura

```
e2ee-chat-webrtc/
├─ server/
│  ├─ package.json
│  └─ server.js
└─ client/
   ├─ package.json
   ├─ index.html
   └─ src/
      ├─ main.jsx
      ├─ App.jsx
      ├─ Chat.jsx
      ├─ VideoCall.jsx
      ├─ crypto.js
      ├─ ws.js
      └─ styles.css
```

---

## Co kód dělá – krok za krokem

### E2EE pro zprávy a obrázky (client/src/crypto.js)
1. **Generování identity (ECDH P‑256):**
   - `generateIdentity()` vytvoří klíčový pár (privátní zůstává v prohlížeči, veřejný se pošle na server, aby si ho mohl druhý uživatel stáhnout).

2. **Odvození sdíleného klíče:**
   - Když si uživatel vybere partnera k chatu, zavolá se `deriveSharedKey(myPrivateKey, peerPublicJwk)`. 
   - Pomocí ECDH se spočítá tajemství a rovnou z něj vznikne klíč `AES‑GCM 256` (pouze pro šifrování/dešifrování).

3. **Šifrování/Dešifrování:**
   - `encryptString(text, aesKey)` a `decryptToString(...)` pro text.
   - `encryptBytes(bytes, aesKey)` a `decryptToBytes(...)` pro binární data (obrázky).
   - Každá zpráva má **náhodné IV** (12 B) pro AES‑GCM.

4. **Konverze:**
   - Pomocné funkce převádí ArrayBuffer ⇄ Base64, aby šlo šifrovaná data posílat přes WebSocket jako JSON.

> **Bezpečnostní poznámky:** Pro jednoduchost se nepoužívá HKDF ani rotace klíčů/identity. Pro reálné nasazení přidej ověřování identity (např. QR kódy / fingerprinty), podpisy, uložení priv. klíče mimo localStorage apod.

### WebSocket server (server/server.js)
- Příkazy:
  - `register` (uživatel + jeho veřejný klíč JWK)
  - `users` (seznam uživatelů a jejich veřejných klíčů)
  - `message` (E2EE text)
  - `image` (E2EE obrázek)
  - `call-offer` / `call-answer` / `ice-candidate` (signaling pro WebRTC)
- Server pouze **předává** zprávy určenému příjemci.

### React klient
- Přihlášení jménem (lokálně, bez hesla).
- Seznam online uživatelů (vč. jejich veřejných klíčů).
- Po kliknutí na uživatele se odvodí sdílený AES klíč a otevře chat.
- Tlačítko pro nahrání obrázku – soubor se **před odesláním šifruje** v prohlížeči.
- Záložka „Video“ – stisk „Start Call“ vytvoří WebRTC nabídku; druhá strana přijme a videohovor běží (STUN Google).

---

## Limitace a tipy
- **TURN** není nastavený → v některých sítích se nemusí WebRTC spojit. Pro prototyp to nevadí; do produkce přidej svůj TURN.
- Klíče se po refreshi **regenerují** (není perzistence). Je to záměr, aby byl kód jednoduchý.
- Obrázky se neposílají po částech – pro velké soubory by bylo vhodné chunkování/SharedArrayBuffer/WebRTC DataChannel apod.
- Server je **in‑memory** – žádná DB. Vhodné jen pro demo.
