// === OBS WebSocket Integration for SHOW DISPLAY ===
const OBS_WEBSOCKET_URL = "ws://localhost:4455"; // Change if needed
const OBS_WEBSOCKET_PASSWORD = "1JNTFbSBN3BG8zHzw"; // Set your OBS WebSocket password if any
const DISPLAY_SOURCE_NAME = "Draft Overlay"; // Name of the browser source in OBS
const DISPLAY_BROWSER_URL = "https://mlbb-stream-overlays.vercel.app/display.html"; // Change to your display URL

async function createObsBrowserSource() {
    if (!window.WebSocket) {
        alert("WebSocket not supported in this browser.");
        return;
    }
    const ws = new WebSocket(OBS_WEBSOCKET_URL);
    ws.onopen = () => {
        // Authenticate if password is set (OBS WebSocket v5+ uses JSON-RPC)
        if (OBS_WEBSOCKET_PASSWORD) {
            ws.send(JSON.stringify({
                op: 1,
                d: { rpcVersion: 1 }
            }));
        } else {
            // No password, proceed to create source
            sendCreateSource(ws);
        }
    };
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        // Handle authentication (if password is set)
        if (msg.op === 2 && msg.d.authentication) {
            // Password required, send authentication
            ws.send(JSON.stringify({
                op: 3,
                d: {
                    rpcVersion: 1,
                    authentication: OBS_WEBSOCKET_PASSWORD
                }
            }));
        } else if (msg.op === 2 && msg.d.negotiatedRpcVersion) {
            // Authenticated, create source
            sendCreateSource(ws);
        } else if (msg.op === 7) {
            // Request response
            if (msg.d.requestStatus && msg.d.requestStatus.result) {
                alert("Display browser source created in OBS!");
            } else {
                alert("Failed to create browser source: " + (msg.d.requestStatus?.comment || "Unknown error"));
            }
            ws.close();
        }
    };
    ws.onerror = (err) => {
        alert("Failed to connect to OBS WebSocket. Is OBS running and WebSocket enabled?");
    };
}

function sendCreateSource(ws) {
    // Create a browser source in the current scene
    ws.send(JSON.stringify({
        op: 6,
        d: {
            requestType: "CreateInput",
            requestId: "create-browser-source-" + Date.now(),
            requestData: {
                sceneName: "Scene", // Current scene
                inputName: DISPLAY_SOURCE_NAME,
                inputKind: "browser_source",
                inputSettings: {
                    url: DISPLAY_BROWSER_URL,
                    width: 1920,
                    height: 1080   
                },
                sceneItemEnabled: true
            }
        }
    }));
}

document.getElementById("show-display-button").addEventListener("click", createObsBrowserSource);
