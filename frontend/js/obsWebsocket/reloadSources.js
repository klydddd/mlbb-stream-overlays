// RELOAD OBS (controller toolbar): refreshes every browser source in OBS, the same as
// pressing "Refresh cache of current page" in each source's properties.
//
// Talks to the OBS WebSocket server (OBS 28+: Tools > WebSocket Server Settings) with the
// v5 protocol: Hello -> Identify (with the password hash if OBS asks for one) ->
// GetInputList -> PressInputPropertiesButton "refreshnocache" for each browser source.
//
// The address and password are typed in the OBS settings row under the toolbar and kept in
// this browser's localStorage ("obs-ws-url", "obs-ws-password"). They are put back after
// RESET DRAFT, which clears localStorage. Nothing here is sent to the overlays.

const DEFAULT_URL = "ws://localhost:4455";
const URL_KEY = "obs-ws-url";
const PASSWORD_KEY = "obs-ws-password";
const TIMEOUT_MS = 6000;

const $ = (id) => document.getElementById(id);
const button = $("obs-reload");
const status = $("obs-status");
const settings = $("obs-settings");
const urlInput = $("obs-url");
const passwordInput = $("obs-password");

const read = (key) => {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
};
const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
};

function setStatus(text, kind = "") {
  status.textContent = text;
  status.dataset.kind = kind; // "", "ok", "error"
}

async function sha256Base64(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...bytes));
}

// OBS WebSocket v5 auth string: base64(sha256(base64(sha256(password + salt)) + challenge))
async function authString(password, { salt, challenge }) {
  return sha256Base64((await sha256Base64(password + salt)) + challenge);
}

class ObsError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

// Connect, identify, and hand back request(type, data) -> Promise<responseData>.
function connect(url, password) {
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

let busy = false;

async function reloadAll() {
  if (busy) return;
  busy = true;
  button.disabled = true;
  setStatus("CONNECTING TO OBS…");
  let obs;
  try {
    obs = await connect(read(URL_KEY) || DEFAULT_URL, read(PASSWORD_KEY));
    const { inputs = [] } = await obs.request("GetInputList");
    const browsers = inputs.filter((i) => (i.unversionedInputKind || i.inputKind) === "browser_source");
    if (!browsers.length) {
      setStatus("NO BROWSER SOURCES IN OBS", "error");
      return;
    }
    const results = await Promise.allSettled(browsers.map((i) =>
      obs.request("PressInputPropertiesButton", { inputName: i.inputName, propertyName: "refreshnocache" })));
    const failed = browsers.filter((_, n) => results[n].status === "rejected").map((i) => i.inputName);
    const done = browsers.length - failed.length;
    if (failed.length) setStatus(`RELOADED ${done}/${browsers.length}. FAILED: ${failed.join(", ")}`, "error");
    else setStatus(`RELOADED ${done} BROWSER SOURCE${done === 1 ? "" : "S"}`, "ok");
  } catch (err) {
    const hint = err.hint === "enable"
      ? " · IS OBS OPEN? TOOLS > WEBSOCKET SERVER SETTINGS > ENABLE"
      : err.hint === "settings" ? " · CHECK OBS SETTINGS" : "";
    setStatus((err.message || "OBS ERROR") + hint, "error");
    if (err.hint === "settings") settings.hidden = false;
  } finally {
    obs?.close();
    busy = false;
    button.disabled = false;
  }
}

// ---------- settings row ----------

function fillSettings() {
  urlInput.value = read(URL_KEY) || DEFAULT_URL;
  passwordInput.value = read(PASSWORD_KEY);
}

$("obs-settings-toggle").addEventListener("click", () => {
  settings.hidden = !settings.hidden;
  if (!settings.hidden) fillSettings();
});

// kept in memory too, for RESET DRAFT below
const saved = { url: read(URL_KEY), password: read(PASSWORD_KEY) };

urlInput.addEventListener("change", () => {
  const v = urlInput.value.trim();
  saved.url = v && v !== DEFAULT_URL ? v : "";
  write(URL_KEY, saved.url);
});
passwordInput.addEventListener("change", () => {
  saved.password = passwordInput.value;
  write(PASSWORD_KEY, saved.password);
});

button.addEventListener("click", reloadAll);

// RESET DRAFT clears all of localStorage (control.js runs first): put these back
$("reset")?.addEventListener("click", () => {
  write(URL_KEY, saved.url);
  write(PASSWORD_KEY, saved.password);
  fillSettings(); // reset also blanks every text input, this one included
});

fillSettings();
