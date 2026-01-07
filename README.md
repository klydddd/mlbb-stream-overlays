# MLBB Stream Overlay

An OBS browser source controller for Mobile Legends: Bang Bang tournaments and livestreams. Control team logos, names, scores, and overlays in real time through a browser interface.

## Features

- Live overlay updates for team names, scores, and visuals
- Drag-and-drop overlay editing for custom layouts
- Real-time scoreboard without restarting sources
- AI-powered hero recognition during draft phase
- Multi-scanner calibration for 16 slots (6 bans + 10 picks)

## Requirements

- Python 3.10+
- OBS Studio with WebSocket Server enabled
- NVIDIA GPU recommended for faster AI inference (optional)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/klydddd/mlbb-stream-overlays.git
cd mlbb-stream-overlays
```

### 2. Set Up Python Environment

```bash
cd python
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

### 3. GPU Setup (Optional)

For GPU acceleration, see [GPU_SETUP_GUIDE.md](GPU_SETUP_GUIDE.md). Verify GPU detection:

```bash
python gpu_check.py
```

## Running the Application

### Step 1: Start the WebSocket Server

```bash
cd python/server
uvicorn server:app --port 8080 --host 0.0.0.0
```

Keep this terminal open.

### Step 2: Run the AI Bot

Open a new terminal:

```bash
cd python
.venv\Scripts\activate
python ai_bot_multi_auto.py
```

The script will:
1. List available windows - select the one showing the draft screen
2. Guide you through calibrating 16 scan regions (6 bans + 10 picks)
3. Automatically start scanning and sending hero predictions

### AI Bot Controls

**Calibration Phase:**
- Left Click: Set region position
- Scroll: Resize scan area (20-200px)
- S: Skip current slot
- R: Restart calibration
- Q: Quit

**Preview Phase:**
- P: Pause/Resume recognition
- E: Toggle edit mode
- Q: Quit

**Edit Mode (after pressing E):**
- Shift+1-6: Adjust ban regions
- 1-0: Adjust pick regions (1-9 for picks 1-9, 0 for pick-10)

### Step 3: OBS Setup

1. In OBS, go to **Tools > WebSocket Server Settings**
   - Enable WebSocket Server
   - Disable Authentication
2. Go to **Docks > Custom Browser Docks**
   - Add URL: `https://mlbb-stream-overlays.vercel.app/controller.html`
3. Open the dock and click **SHOW DISPLAY**
4. In Draft Overlay Source settings:
   - Enable "Control Audio via OBS"
   - Enable "Use Custom Frame Rate (60 FPS)"

## File Structure

```
python/
  ai_bot_multi_auto.py    # Combined calibration + AI bot (recommended)
  ai_bot_multi.py         # AI bot only (requires manual config)
  calibration_multi.py    # Calibration tool only
  server/server.py        # WebSocket server
  mlbb_hero_model_pro/    # TensorFlow model for hero recognition
  requirements.txt        # Python dependencies
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| HTML/CSS/JS | Overlay interface |
| Python | AI bot and server |
| TensorFlow | Hero recognition model |
| FastAPI | WebSocket server |
| OpenCV | Screen capture and image processing |

## Author

Developed by klyduuu

## License

Open for educational and event use. Attribution appreciated for public broadcasts.
