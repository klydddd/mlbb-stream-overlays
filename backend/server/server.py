# server.py - FastAPI WebSocket relay server with Private Rooms
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List, Dict

app = FastAPI()

# Enable CORS for cross-origin WebSocket connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store connected clients grouped by room_code
# Format: {"room1": [client1, client2], "room2": [client3]}
rooms: Dict[str, List[WebSocket]] = {}

@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await websocket.accept()
    
    # Initialize the room if it doesn't exist
    if room_code not in rooms:
        rooms[room_code] = []
        
    rooms[room_code].append(websocket)
    print(f"Client connected to room '{room_code}'. Room Total: {len(rooms[room_code])}")
    
    try:
        while True:
            # Receive message from this client
            data = await websocket.receive_text()
            
            # Broadcast to all OTHER clients in the SAME room
            for client in rooms[room_code]:
                if client != websocket:
                    await client.send_text(data)
                    
    except WebSocketDisconnect:
        rooms[room_code].remove(websocket)
        print(f"Client disconnected from room '{room_code}'. Room Total: {len(rooms[room_code])}")
        
        # Cleanup empty rooms
        if not rooms[room_code]:
            del rooms[room_code]
            print(f"Room '{room_code}' is now empty and was deleted.")

@app.get("/api/health")
async def health_check():
    return {"status": "running", "active_rooms": len(rooms)}

# Mount the frontend directory to serve static files (HTML, JS, CSS, Assets)
# This MUST be added AFTER other routes so it doesn't override them.
frontend_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    print(f"Warning: Frontend directory not found at {frontend_path}")