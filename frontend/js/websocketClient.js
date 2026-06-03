// websocketClient.js
const getWebSocketUrl = () => {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;

    // Don't attempt WebSocket on production (Vercel) - no WS server there
    if (hostname.includes('vercel.app') || hostname.includes('.vercel.app')) {
        return null;  // Signal that WebSocket is not available
    }

    // When on localhost, use ws://
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'ws://localhost:8080/ws';
    }

    // For other local network IPs, use ws://
    return `ws://${hostname}:8080/ws`;
};

const WS_URL = getWebSocketUrl();

let socket = null;
let messageHandlers = [];
let isConnected = false;

function connect() {
    // Skip WebSocket if URL is null (e.g., on Vercel)
    if (!WS_URL) {
        console.log("WebSocket disabled for this environment (using localStorage only)");
        return;
    }

    try {
        console.log("Connecting to", WS_URL);
        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            console.log("Connected to", WS_URL);
            isConnected = true;
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                messageHandlers.forEach((handler) => handler(data));
            } catch (error) {
                console.error("Error parsing message:", error);
            }
        };

        socket.onclose = () => {
            console.log("Disconnected, reconnecting in 3s...");
            isConnected = false;
            setTimeout(connect, 3000);
        };

        socket.onerror = (error) => {
            console.error("WebSocket error:", error);
        };
    } catch (error) {
        console.error("Failed to create WebSocket:", error);
    }
}

function send(message) {
    // Silently skip if WebSocket is not available
    if (!WS_URL || !socket || socket.readyState !== WebSocket.OPEN) {
        // WebSocket not available, but that's okay - localStorage will handle it
        return false;
    }
    socket.send(JSON.stringify(message));
    return true;
}

function onMessage(handler) {
    messageHandlers.push(handler);
}

function getConnectionStatus() {
    return isConnected;
}

// auto-connect (will skip if WS_URL is null)
connect();

export {
    send,
    onMessage,
    getConnectionStatus
};