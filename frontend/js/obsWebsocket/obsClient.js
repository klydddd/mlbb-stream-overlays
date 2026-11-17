// OBS WebSocket v5 client shared by the controller's OBS tools
// (js/obsWebsocket/reloadSources.js, js/obsWebsocket/camSources.js).
// connect() does Hello -> Identify (with the password hash if OBS asks for one) and hands
// back request(type, data) -> Promise<responseData>. Address and password come from the
// OBS SETTINGS row, kept in this browser's localStorage ("obs-ws-url", "obs-ws-password").

export const DEFAULT_URL = "ws://localhost:4455";
export const URL_KEY = "obs-ws-url";
export const PASSWORD_KEY = "obs-ws-password";
const TIMEOUT_MS = 6000;


export const read = (key) => {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
};
export const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
};


async function sha256Base64(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...bytes));
}

// OBS WebSocket v5 auth string: base64(sha256(base64(sha256(password + salt)) + challenge))
async function authString(password, { salt, challenge }) {
  return sha256Base64((await sha256Base64(password + salt)) + challenge);
}

export class ObsError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

// Connect, identify, and hand back request(type, data) -> Promise<responseData>.
export function connect(url, password) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      reject(new ObsError("BAD OBS ADDRESS", "settings"));
      return;
    }
    const pending = new Map();
    let identified = false;
    let nextId = 1;
    const timer = setTimeout(() => {
      ws.close();
      reject(new ObsError("OBS DID NOT ANSWER", "enable"));
    }, TIMEOUT_MS);

    const api = {
      request(requestType, requestData = {}) {
        const requestId = String(nextId++);
        ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
        return new Promise((res, rej) => pending.set(requestId, { res, rej, requestType }));
      },
      close: () => ws.close(),
    };

    ws.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.op === 0) { // Hello
        const auth = msg.d?.authentication;
        const d = { rpcVersion: 1, eventSubscriptions: 0 };
        if (auth) {
          if (!password) {
            clearTimeout(timer);
            ws.close();
            reject(new ObsError("OBS NEEDS ITS WEBSOCKET PASSWORD", "settings"));
            return;
          }
          if (!window.crypto?.subtle) {
            clearTimeout(timer);
            ws.close();
            reject(new ObsError("OPEN THE CONTROLLER FROM LOCALHOST OR HTTPS TO USE AN OBS PASSWORD"));
            return;
          }
          d.authentication = await authString(password, auth);
        }
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (msg.op === 2) { // Identified
        identified = true;
        clearTimeout(timer);
        resolve(api);
      } else if (msg.op === 7) { // RequestResponse
        const p = pending.get(msg.d?.requestId);
        if (!p) return;
        pending.delete(msg.d.requestId);
        if (msg.d.requestStatus?.result) p.res(msg.d.responseData || {});
        else p.rej(new ObsError(`${p.requestType} FAILED: ${msg.d.requestStatus?.comment || msg.d.requestStatus?.code}`));
      }
    };

    ws.onclose = (event) => {
      clearTimeout(timer);
      pending.forEach((p) => p.rej(new ObsError("OBS CLOSED THE CONNECTION")));
      pending.clear();
      if (identified) return;
      if (event.code === 4009) reject(new ObsError("WRONG OBS WEBSOCKET PASSWORD", "settings"));
      else reject(new ObsError("CAN'T REACH OBS", "enable"));
    };
  });
}

// status-line text for a failed OBS call
export function errorText(err) {
  const hint = err.hint === "enable"
    ? " · IS OBS OPEN? TOOLS > WEBSOCKET SERVER SETTINGS > ENABLE"
    : err.hint === "settings" ? " · CHECK OBS SETTINGS" : "";
  return (err.message || "OBS ERROR") + hint;
}

// connect with the saved OBS SETTINGS
export const connectSaved = () => connect(read(URL_KEY) || DEFAULT_URL, read(PASSWORD_KEY));
