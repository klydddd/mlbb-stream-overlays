import websocket
import json
import threading
import time
import cv2
import numpy as np
import mss
import tensorflow as tf
from collections import deque
import pygetwindow as gw
import os

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ============================================================
# GPU CONFIGURATION
# Configure TensorFlow to use GPU if available
# ============================================================
print("🔍 Checking for GPU availability...")
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        # Enable memory growth to prevent TensorFlow from allocating all GPU memory at once
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
        
        # Optional: Set memory limit (uncomment if you want to limit GPU memory usage)
        # tf.config.set_logical_device_configuration(
        #     gpus[0],
        #     [tf.config.LogicalDeviceConfiguration(memory_limit=4096)]  # 4GB limit
        # )
        
        logical_gpus = tf.config.list_logical_devices('GPU')
        print(f"✅ GPU ENABLED: {len(gpus)} Physical GPU(s), {len(logical_gpus)} Logical GPU(s)")
        for i, gpu in enumerate(gpus):
            print(f"   GPU {i}: {gpu.name}")
    except RuntimeError as e:
        print(f"⚠️ GPU configuration error: {e}")
        print("   Falling back to CPU")
else:
    print("⚠️ No GPU found. Using CPU (this will be slower)")
    print("   To enable GPU support, install CUDA and cuDNN, then install tensorflow-gpu")

# --- CONFIGURATION ---
WS_URL = "ws://localhost:8080/ws"

# Window title to track (partial match) - update this after running calibration.py
TARGET_WINDOW_TITLE = "test.jpg"
# ============================================================
# MULTI-SCANNER CONFIGURATION
# Define 16 scan regions - 6 bans + 10 picks
# Each region is defined as: {'rel_x': X, 'rel_y': Y, 'w': WIDTH, 'h': HEIGHT}
# These coordinates are relative to the target window's top-left corner
# 
# Run calibration.py to determine exact coordinates for each slot
# ============================================================

# Default scan region size (adjust based on your screen capture)
SCAN_WIDTH = 100
SCAN_HEIGHT = 100

# SCANNER REGIONS - Update these coordinates for your specific capture
# Format: slot_name: {'rel_x': X, 'rel_y': Y, 'w': WIDTH, 'h': HEIGHT}


SCAN_REGIONS = {
    'ban-1': {'rel_x': 570, 'rel_y': 68, 'w': 100, 'h': 100},
    'ban-2': {'rel_x': 651, 'rel_y': 73, 'w': 100, 'h': 100},
    'ban-3': {'rel_x': 726, 'rel_y': 72, 'w': 100, 'h': 100},
    'ban-4': {'rel_x': 1297, 'rel_y': 62, 'w': 100, 'h': 100},
    'ban-5': {'rel_x': 1227, 'rel_y': 62, 'w': 100, 'h': 100},
    'ban-6': {'rel_x': 1141, 'rel_y': 63, 'w': 100, 'h': 100},
    'pick-1': {'rel_x': 79, 'rel_y': 153, 'w': 100, 'h': 100},
    'pick-2': {'rel_x': 77, 'rel_y': 284, 'w': 100, 'h': 100},
    'pick-3': {'rel_x': 73, 'rel_y': 412, 'w': 100, 'h': 100},
    'pick-4': {'rel_x': 79, 'rel_y': 532, 'w': 100, 'h': 100},
    'pick-5': {'rel_x': 82, 'rel_y': 650, 'w': 100, 'h': 100},
    'pick-6': {'rel_x': 1291, 'rel_y': 165, 'w': 100, 'h': 100},
    'pick-7': {'rel_x': 1286, 'rel_y': 299, 'w': 100, 'h': 100},
    'pick-8': {'rel_x': 1278, 'rel_y': 418, 'w': 100, 'h': 100},
    'pick-9': {'rel_x': 1278, 'rel_y': 548, 'w': 100, 'h': 100},
    'pick-10': {'rel_x': 1287, 'rel_y': 659, 'w': 100, 'h': 100},
}

# Model input configuration
MODEL_INPUT_SIZE = (224, 224)

# Model path
MODEL_PATH = os.path.join(SCRIPT_DIR, "mlbb_hero_model_pro")
LABELS_PATH = os.path.join(MODEL_PATH, "labels.txt")

# Confidence threshold
CONFIDENCE_THRESHOLD = 0.6

# --- STATE ---
# Track last sent hero for each slot to avoid spamming
last_sent_heroes = {slot: None for slot in SCAN_REGIONS.keys()}
# Prediction history for stability (per slot)
prediction_histories = {slot: deque(maxlen=5) for slot in SCAN_REGIONS.keys()}
ws = None


def load_classes():
    """Load class names from labels.txt file."""
    try:
        with open(LABELS_PATH, 'r', encoding='utf-8') as f:
            classes = [line.strip() for line in f if line.strip()]
        print(f"✅ Loaded {len(classes)} hero classes from labels.txt")
        return classes
    except FileNotFoundError:
        print(f"❌ labels.txt not found at: {LABELS_PATH}")
        return []
    except Exception as e:
        print(f"❌ Error loading labels: {e}")
        return []


CLASSES = load_classes()

# --- LOAD MODEL ---
print(f"Loading Model from: {MODEL_PATH}")
try:
    model = tf.saved_model.load(MODEL_PATH)
    infer = model.signatures["serving_default"]
    print("✅ Model Loaded Successfully!")
except Exception as e:
    print(f"❌ Failed to load model: {e}")
    exit(1)


def on_open(ws_conn):
    print(f"✅ AI Bot Connected to {WS_URL}")


def on_message(ws_conn, message):
    try:
        data = json.loads(message)
        print(f"📨 Received: {data.get('type', 'unknown')}")
    except json.JSONDecodeError:
        pass


def on_error(ws_conn, error):
    if error:
        print(f"❌ WebSocket Error: {error}")


def on_close(ws_conn, close_status_code, close_msg):
    print(f"⚠️ Disconnected (Code: {close_status_code})")
    print("🔄 Will attempt to reconnect...")


def send_prediction(slot_name, hero_name):
    """Send a hero prediction for a specific slot to the WebSocket server."""
    global ws
    
    # Don't spam if same hero
    if hero_name == last_sent_heroes.get(slot_name):
        return
    
    if ws is None:
        return
    
    # Determine if it's a ban or pick
    slot_type = 'ban' if slot_name.startswith('ban') else 'pick'
    slot_index = int(slot_name.split('-')[1])
    
    payload = {
        "type": "ai_prediction",
        "data": {
            "slot": slot_name,
            "slot_type": slot_type,
            "slot_index": slot_index,
            "name": hero_name
        }
    }
    
    try:
        ws.send(json.dumps(payload))
        print(f"🚀 [{slot_name}] Sent: {hero_name}")
        last_sent_heroes[slot_name] = hero_name
    except Exception as e:
        print(f"❌ Failed to send: {e}")


def get_window_position():
    """Get the target window's position."""
    try:
        wins = gw.getWindowsWithTitle(TARGET_WINDOW_TITLE)
        if not wins:
            return None
        win = wins[0]
        if win.isMinimized:
            return None
        return {'left': win.left, 'top': win.top}
    except Exception as e:
        print(f"⚠️ Error getting window: {e}")
        return None


def get_region_monitor(window_pos, region_config):
    """Calculate the absolute screen coordinates for a scan region."""
    return {
        "top": window_pos['top'] + region_config['rel_y'],
        "left": window_pos['left'] + region_config['rel_x'],
        "width": region_config['w'],
        "height": region_config['h']
    }


def preprocess_frame(frame):
    """Preprocess the captured frame for model inference."""
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2RGB)
    resized = cv2.resize(rgb_frame, MODEL_INPUT_SIZE)
    float_frame = resized.astype(np.float32)
    batched = np.expand_dims(float_frame, axis=0)
    return batched


def predict_hero(frame):
    """Run inference on a frame and return the predicted hero name."""
    try:
        input_tensor = preprocess_frame(frame)
        
        # Explicitly try to use GPU if available, otherwise use CPU
        gpus = tf.config.list_physical_devices('GPU')
        device_name = '/GPU:0' if gpus else '/CPU:0'
        
        with tf.device(device_name):
            input_tf = tf.constant(input_tensor)
            predictions = infer(input_tf)
            output_key = list(predictions.keys())[0]
            output = predictions[output_key].numpy()[0]
            predicted_idx = np.argmax(output)
            confidence = output[predicted_idx]
        
        if confidence >= CONFIDENCE_THRESHOLD and predicted_idx < len(CLASSES):
            return CLASSES[predicted_idx], confidence
        return None, confidence
    except Exception as e:
        print(f"⚠️ Prediction error: {e}")
        return None, 0.0


def get_stable_prediction(slot_name):
    """Get a stable prediction based on recent history."""
    history = prediction_histories[slot_name]
    if len(history) < 3:
        return None
    
    from collections import Counter
    counts = Counter(history)
    most_common = counts.most_common(1)[0]
    
    if most_common[1] >= len(history) * 0.6:
        return most_common[0]
    return None


def create_multi_preview(frames_dict, predictions_dict):
    """Create a combined preview showing all scan regions."""
    # Create a grid layout for preview
    num_cols = 4
    num_rows = 4
    cell_width = 150
    cell_height = 120
    
    preview = np.zeros((num_rows * cell_height, num_cols * cell_width, 3), dtype=np.uint8)
    
    slots_order = [
        'ban-1', 'ban-2', 'ban-3', 'ban-4',
        'ban-5', 'ban-6', 'pick-1', 'pick-2',
        'pick-3', 'pick-4', 'pick-5', 'pick-6',
        'pick-7', 'pick-8', 'pick-9', 'pick-10'
    ]
    
    font = cv2.FONT_HERSHEY_SIMPLEX
    
    for idx, slot in enumerate(slots_order):
        row = idx // num_cols
        col = idx % num_cols
        x = col * cell_width
        y = row * cell_height
        
        if slot in frames_dict and frames_dict[slot] is not None:
            frame = frames_dict[slot]
            if frame.shape[2] == 4:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
            frame_resized = cv2.resize(frame, (cell_width - 4, cell_height - 30))
            preview[y+2:y+cell_height-28, x+2:x+cell_width-2] = frame_resized
        
        # Draw slot label
        hero_name = predictions_dict.get(slot, "---")
        if hero_name is None:
            hero_name = "---"
        
        # Slot name
        cv2.putText(preview, slot, (x + 5, y + cell_height - 12), font, 0.4, (255, 255, 255), 1)
        # Hero name
        color = (0, 255, 0) if hero_name != "---" else (100, 100, 100)
        display_name = hero_name[:12] if len(hero_name) > 12 else hero_name
        cv2.putText(preview, display_name, (x + 60, y + cell_height - 12), font, 0.35, color, 1)
        
        # Border
        border_color = (0, 255, 0) if hero_name != "---" else (50, 50, 50)
        cv2.rectangle(preview, (x, y), (x + cell_width - 1, y + cell_height - 1), border_color, 1)
    
    return preview


def recognition_loop():
    """Main loop for multi-region scanning."""
    print("🎮 Starting multi-scanner recognition loop...")
    print(f"📡 Scanning {len(SCAN_REGIONS)} regions simultaneously")
    print("📺 Live preview window opening... (Press 'Q' to close)")
    
    with mss.mss() as sct:
        while True:
            window_pos = get_window_position()
            
            if not window_pos:
                print(f"⏳ Waiting for '{TARGET_WINDOW_TITLE}' window...")
                # Clear all histories when window is lost
                for history in prediction_histories.values():
                    history.clear()
                cv2.destroyAllWindows()
                time.sleep(2)
                continue
            
            frames = {}
            predictions = {}
            
            # Scan all regions
            for slot_name, region_config in SCAN_REGIONS.items():
                try:
                    monitor = get_region_monitor(window_pos, region_config)
                    frame = np.array(sct.grab(monitor))
                    frames[slot_name] = frame
                    
                    # Run prediction
                    hero_name, confidence = predict_hero(frame)
                    
                    if hero_name:
                        prediction_histories[slot_name].append(hero_name)
                        stable_hero = get_stable_prediction(slot_name)
                        
                        if stable_hero:
                            predictions[slot_name] = stable_hero
                            send_prediction(slot_name, stable_hero)
                    else:
                        predictions[slot_name] = None
                        
                except Exception as e:
                    print(f"⚠️ Error scanning {slot_name}: {e}")
                    frames[slot_name] = None
                    predictions[slot_name] = None
            
            # Show combined preview
            preview = create_multi_preview(frames, predictions)
            cv2.imshow("AI Multi-Scanner (Press Q to close)", preview)
            
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                cv2.destroyAllWindows()
                print("📺 Preview closed")
            
            # Small delay
            time.sleep(0.2)


if __name__ == "__main__":
    print("=" * 60)
    print("🤖 MLBB AI Hero Recognition Bot - MULTI-SCANNER MODE")
    print("=" * 60)
    print(f"📡 WebSocket: {WS_URL}")
    print(f"🎯 Window: '{TARGET_WINDOW_TITLE}'")
    print(f"📦 Classes: {len(CLASSES)} heroes")
    print(f"🔍 Scanners: {len(SCAN_REGIONS)} regions")
    print("=" * 60)
    print()
    print("⚠️  IMPORTANT: Update SCAN_REGIONS coordinates for your setup!")
    print("    Run calibration.py to find the correct coordinates.")
    print()
    
    # Start recognition thread
    t = threading.Thread(target=recognition_loop, daemon=True)
    t.start()
    
    # WebSocket connection with auto-reconnect
    websocket.enableTrace(False)
    
    while True:
        try:
            ws = websocket.WebSocketApp(
                WS_URL,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            ws.run_forever(ping_interval=30, ping_timeout=10)
            print("🔄 Reconnecting in 3 seconds...")
            time.sleep(3)
        except KeyboardInterrupt:
            print("\n👋 Shutting down...")
            break
        except Exception as e:
            print(f"❌ Connection error: {e}")
            time.sleep(5)
