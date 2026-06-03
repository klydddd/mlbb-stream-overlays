// websocketClient.js

function generateRoomCode(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getRoomCode() {
    const urlParams = new URLSearchParams(window.location.search);
    let room = urlParams.get('room');
    
    if (!room) {
        room = generateRoomCode();
        // Update the URL without reloading the page
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('room', room);
        window.history.replaceState({}, '', newUrl);
        console.log("Created new private room:", room);
    }
    return room;
}

const getWebSocketUrl = () => {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const roomCode = getRoomCode();

    // If testing locally (frontend via Live Server, Backend on 8080)
    // or if the backend itself is accessed at localhost:8080
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `ws://localhost:8080/ws/${roomCode}`;
    }

    // For hosted environments (All-in-One Approach)
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Connect to the same host that served the page
    return `${wsProtocol}//${window.location.host}/ws/${roomCode}`;
};

const WS_URL = getWebSocketUrl();

let socket = null;
let messageHandlers = [];
let isConnected = false;

function connect() {
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
    if (!socket || socket.readyState !== WebSocket.OPEN) {
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

// auto-connect
connect();

export {
    send,
    onMessage,
    getConnectionStatus
};