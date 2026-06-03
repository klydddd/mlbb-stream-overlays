# server.py - FastAPI WebSocket relay server
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List

app = FastAPI()

# Enable CORS for cross-origin WebSocket connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store all connected clients
connected_clients: List[WebSocket] = []

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    print(f"✅ Client connected. Total: {len(connected_clients)}")
    
    try:
        while True:
            # Receive message from this client
            data = await websocket.receive_text()
            
            # Broadcast to all OTHER clients
            for client in connected_clients:
                if client != websocket:
                    await client.send_text(data)
                    
    except WebSocketDisconnect:
        connected_clients.remove(websocket)
        print(f"❌ Client disconnected. Total: {len(connected_clients)}")

# Optional: Health check endpoint
@app.get("/")
async def root():
    return {"status": "running", "clients": len(connected_clients)}