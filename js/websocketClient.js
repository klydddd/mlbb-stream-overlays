// websocketClient.js
const getWebSocketUrl = () => {
    // When on localhost, use localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'ws://localhost:8080/ws';
    }
    // Otherwise, use the same IP as the webpage
    return `ws://${window.location.hostname}:8080/ws`;
};

const WS_URL = getWebSocketUrl();

let socket = null;
let messageHandlers = [];
let isConnected = false;


function connect() {
    console.log("Connecting...");
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

}

function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
    }
    console.warn('Websocket not connected, message not sent');
    return false;
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
