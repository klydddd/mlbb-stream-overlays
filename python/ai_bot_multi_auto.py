"""
MLBB AI Bot with Integrated Calibration
This script combines calibration and AI bot functionality into one seamless workflow.

Usage:
1. Run this script
2. Select the target window
3. Calibrate the 16 scan regions (6 bans + 10 picks)
4. The AI bot will automatically start scanning with your calibrated regions

No manual config copying needed!
"""

import websocket
import json
import threading
import time
import cv2
import numpy as np
import mss
import tensorflow as tf
from collections import deque, Counter
import pygetwindow as gw
import os

# Get the directory where this script is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ============================================================
# GPU CONFIGURATION
# ============================================================
print("🔍 Checking for GPU availability...")
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
        logical_gpus = tf.config.list_logical_devices('GPU')
        print(f"✅ GPU ENABLED: {len(gpus)} Physical GPU(s), {len(logical_gpus)} Logical GPU(s)")
        for i, gpu in enumerate(gpus):
            print(f"   GPU {i}: {gpu.name}")
    except RuntimeError as e:
        print(f"⚠️ GPU configuration error: {e}")
        print("   Falling back to CPU")
else:
    print("⚠️ No GPU found. Using CPU (this will be slower)")

# ============================================================
# CONFIGURATION
# ============================================================
WS_URL = "ws://localhost:8080/ws"

# Calibration Configuration
SCAN_WIDTH = 100
SCAN_HEIGHT = 100

BAN_SCAN_WIDTH = 50
BAN_SCAN_HEIGHT = 50

# Define the slots in order
SLOTS = [
    'ban-1', 'ban-2', 'ban-3',  # Blue bans
    'ban-4', 'ban-5', 'ban-6',  # Red bans
    'pick-1', 'pick-2', 'pick-3', 'pick-4', 'pick-5',  # Blue picks
    'pick-6', 'pick-7', 'pick-8', 'pick-9', 'pick-10'  # Red picks
]

# Model Configuration
MODEL_INPUT_SIZE = (224, 224)
MODEL_PATH = os.path.join(SCRIPT_DIR, "mlbb_hero_model_pro")
LABELS_PATH = os.path.join(MODEL_PATH, "labels.txt")
CONFIDENCE_THRESHOLD = 0.6

# ============================================================
# GLOBAL STATE
# ============================================================
TARGET_WINDOW_TITLE = None
SCAN_REGIONS = {}
last_sent_heroes = {}
prediction_histories = {}
ws = None
calibration_complete = False
paused = False  # Pause flag for AI bot
should_exit = False  # Flag to terminate entire app
edit_mode = False  # Flag for region adjustment mode
edit_slot = None  # Currently selected slot for editing

# ============================================================
# CALIBRATION FUNCTIONS
# ============================================================
calibrated_regions = {}
current_slot_index = 0
click_point = None
window_info = None
mouse_pos = (0, 0)  # Track mouse position for preview box
scroll_delta = 0  # Track scroll wheel for resizing

def mouse_callback(event, x, y, flags, param):
    global click_point, mouse_pos, scroll_delta
    mouse_pos = (x, y)  # Always track mouse position
    if event == cv2.EVENT_LBUTTONDOWN:
        click_point = (x, y)
    elif event == cv2.EVENT_MOUSEWHEEL:
        # flags > 0 means scroll up (increase size), < 0 means scroll down (decrease)
        scroll_delta = 5 if flags > 0 else -5

def get_windows():
    """List all available windows."""
    windows = gw.getAllTitles()
    return [w for w in windows if w.strip()]

def select_window():
    """Let user select which window to calibrate."""
    windows = get_windows()
    print("\n" + "=" * 60)
    print("Available Windows:")
    print("=" * 60)
    for i, w in enumerate(windows):
        print(f"  [{i}] {w}")
    print("=" * 60)
    
    while True:
        try:
            choice = input("\nEnter window number (or part of window title): ").strip()
            
            if choice.isdigit():
                idx = int(choice)
                if 0 <= idx < len(windows):
                    return windows[idx]
            
            matches = [w for w in windows if choice.lower() in w.lower()]
            if len(matches) == 1:
                return matches[0]
            elif len(matches) > 1:
                print(f"Multiple matches found:")
                for m in matches:
                    print(f"  - {m}")
                continue
            
            print("Invalid selection. Try again.")
        except (ValueError, IndexError):
            print("Invalid input. Try again.")

def capture_window(window_title):
    """Capture the specified window."""
    global window_info
    
    try:
        wins = gw.getWindowsWithTitle(window_title)
        if not wins:
            return None, None
        
        win = wins[0]
        if win.isMinimized:
            win.restore()
        
        window_info = {
            'title': window_title,
            'left': win.left,
            'top': win.top,
            'width': win.width,
            'height': win.height
        }
        
        with mss.mss() as sct:
            monitor = {
                "left": win.left,
                "top": win.top,
                "width": win.width,
                "height": win.height
            }
            screenshot = np.array(sct.grab(monitor))
            screenshot = cv2.cvtColor(screenshot, cv2.COLOR_BGRA2BGR)
            return screenshot, window_info
            
    except Exception as e:
        print(f"Error capturing window: {e}")
        return None, None

def draw_calibration_ui(frame, slot_name, regions_so_far, mouse_position=None, box_size=None):
    """Draw the calibration UI overlay."""
    display = frame.copy()
    h, w = display.shape[:2]
    
    # Draw existing regions
    for name, region in regions_so_far.items():
        x = region['rel_x']
        y = region['rel_y']
        rw = region['w']
        rh = region['h']
        
        color = (255, 100, 0) if 'ban' in name else (0, 255, 0)
        cv2.rectangle(display, (x, y), (x + rw, y + rh), color, 2)
        cv2.putText(display, name, (x + 5, y + 20), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
    
    # Determine box size
    is_ban = 'ban' in slot_name
    if box_size:
        box_w, box_h = box_size
    else:
        box_w = BAN_SCAN_WIDTH if is_ban else SCAN_WIDTH
        box_h = BAN_SCAN_HEIGHT if is_ban else SCAN_HEIGHT
    
    # Draw preview box at mouse position
    if mouse_position:
        mx, my = mouse_position
        # Only draw if mouse is in the frame area (below the header)
        if my > 60:
            preview_x = max(0, mx - box_w // 2)
            preview_y = max(0, my - box_h // 2)
            preview_color = (255, 100, 0) if is_ban else (0, 255, 0)
            # Draw preview box
            cv2.rectangle(display, (preview_x, preview_y), 
                         (preview_x + box_w, preview_y + box_h), 
                         preview_color, 2)
            # Draw crosshair at center
            cv2.line(display, (mx - 10, my), (mx + 10, my), preview_color, 1)
            cv2.line(display, (mx, my - 10), (mx, my + 10), preview_color, 1)
    
    # Draw instruction overlay
    overlay = display.copy()
    cv2.rectangle(overlay, (0, 0), (w, 60), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.7, display, 0.3, 0, display)
    
    slot_color = (255, 100, 0) if is_ban else (0, 255, 0)
    
    cv2.putText(display, f"Click to set: {slot_name} ({box_w}x{box_h})", (10, 25), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, slot_color, 2)
    cv2.putText(display, "S=skip | R=restart | Q=quit | Scroll=resize", (10, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    progress = f"Progress: {len(regions_so_far)}/16"
    cv2.putText(display, progress, (w - 150, 25), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    
    return display

def run_calibration(window_title):
    """Run the calibration process."""
    global click_point, current_slot_index, calibrated_regions, scroll_delta
    
    cv2.namedWindow("Multi-Scanner Calibration")
    cv2.setMouseCallback("Multi-Scanner Calibration", mouse_callback)
    
    print("\n" + "=" * 60)
    print("CALIBRATION MODE")
    print("=" * 60)
    print("Click on the CENTER of each hero portrait region")
    print("Scroll wheel to resize the scan area")
    print()
    print("Controls:")
    print("  LEFT CLICK - Set region for current slot")
    print("  SCROLL - Resize the scan area")
    print("  S - Skip current slot")
    print("  R - Restart calibration")
    print("  Q - Quit the entire app")
    print()
    print("Complete all 16 regions to proceed to AI bot automatically")
    print("=" * 60)
    
    current_slot_index = 0
    
    # Track current box size per slot type
    current_ban_size = (BAN_SCAN_WIDTH, BAN_SCAN_HEIGHT)
    current_pick_size = (SCAN_WIDTH, SCAN_HEIGHT)
    scroll_delta = 0
    
    while current_slot_index < len(SLOTS):
        slot_name = SLOTS[current_slot_index]
        is_ban = 'ban' in slot_name
        
        # Get current size for this slot type
        if is_ban:
            box_w, box_h = current_ban_size
        else:
            box_w, box_h = current_pick_size
        
        # Handle scroll wheel resize
        if scroll_delta != 0:
            box_w = max(20, min(200, box_w + scroll_delta))
            box_h = max(20, min(200, box_h + scroll_delta))
            # Save the size for this slot type
            if is_ban:
                current_ban_size = (box_w, box_h)
            else:
                current_pick_size = (box_w, box_h)
            scroll_delta = 0
        
        screenshot, win_info = capture_window(window_title)
        
        if screenshot is None:
            print(f"Window '{window_title}' not found. Waiting...")
            cv2.waitKey(1000)
            continue
        
        display = draw_calibration_ui(screenshot, slot_name, calibrated_regions, mouse_pos, (box_w, box_h))
        
        cv2.imshow("Multi-Scanner Calibration", display)
        
        key = cv2.waitKey(50) & 0xFF
        
        # Handle click
        if click_point is not None:
            x, y = click_point
            
            # Calculate region centered on click
            rel_x = max(0, x - box_w // 2)
            rel_y = max(0, y - box_h // 2)
            
            calibrated_regions[slot_name] = {
                'rel_x': rel_x,
                'rel_y': rel_y,
                'w': box_w,
                'h': box_h
            }
            
            print(f"✅ {slot_name}: pos=({rel_x}, {rel_y}) size={box_w}x{box_h}")
            current_slot_index += 1
            click_point = None
        
        # Handle keys - support both uppercase and lowercase
        if key == ord('s') or key == ord('S'):  # Skip
            print(f"⏭️ Skipped: {slot_name}")
            current_slot_index += 1
        elif key == ord('r') or key == ord('R'):  # Restart
            print("🔄 Restarting calibration...")
            calibrated_regions.clear()
            current_slot_index = 0
            current_ban_size = (BAN_SCAN_WIDTH, BAN_SCAN_HEIGHT)
            current_pick_size = (SCAN_WIDTH, SCAN_HEIGHT)
        elif key == ord('q') or key == ord('Q'):  # Quit
            print("\n❌ Calibration cancelled. Exiting app...")
            cv2.destroyAllWindows()
            return None, None
    
    cv2.destroyAllWindows()
    return calibrated_regions, window_info

# ============================================================
# AI BOT FUNCTIONS
# ============================================================
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

def load_model():
    """Load the TensorFlow model."""
    print(f"Loading Model from: {MODEL_PATH}")
    try:
        model = tf.saved_model.load(MODEL_PATH)
        infer = model.signatures["serving_default"]
        print("✅ Model Loaded Successfully!")
        return model, infer
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
    
    if hero_name == last_sent_heroes.get(slot_name):
        return
    
    if ws is None:
        return
    
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

def predict_hero(frame, infer, classes):
    """Run inference on a frame and return the predicted hero name and confidence."""
    try:
        input_tensor = preprocess_frame(frame)
        
        gpus = tf.config.list_physical_devices('GPU')
        device_name = '/GPU:0' if gpus else '/CPU:0'
        
        with tf.device(device_name):
            input_tf = tf.constant(input_tensor)
            predictions = infer(input_tf)
            output_key = list(predictions.keys())[0]
            output = predictions[output_key].numpy()[0]
            predicted_idx = np.argmax(output)
            confidence = output[predicted_idx]
        
        # Always return the prediction regardless of confidence
        if predicted_idx < len(classes):
            return classes[predicted_idx], confidence
        return None, 0.0
    except Exception as e:
        print(f"⚠️ Prediction error: {e}")
        return None, 0.0

def get_stable_prediction(slot_name):
    """Get a stable prediction based on recent history."""
    history = prediction_histories[slot_name]
    if len(history) < 3:
        return None
    
    counts = Counter(history)
    most_common = counts.most_common(1)[0]
    
    if most_common[1] >= len(history) * 0.6:
        return most_common[0]
    return None

def create_multi_preview(frames_dict, predictions_dict, confidences_dict, is_paused=False):
    """Create a combined preview showing all scan regions."""
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
            frame_resized = cv2.resize(frame, (cell_width - 4, cell_height - 40))
            preview[y+2:y+cell_height-38, x+2:x+cell_width-2] = frame_resized
        
        hero_name = predictions_dict.get(slot, "---")
        confidence = confidences_dict.get(slot, 0.0)
        if hero_name is None:
            hero_name = "---"
        
        # Slot name
        cv2.putText(preview, slot, (x + 5, y + cell_height - 22), font, 0.35, (255, 255, 255), 1)
        
        # Hero name (truncated if needed)
        display_name = hero_name[:10] if len(hero_name) > 10 else hero_name
        # Color based on confidence: green if >= threshold, yellow if moderate, red if low
        if confidence >= CONFIDENCE_THRESHOLD:
            color = (0, 255, 0)  # Green
        elif confidence >= 0.3:
            color = (0, 255, 255)  # Yellow
        else:
            color = (0, 100, 255)  # Orange-red
        cv2.putText(preview, display_name, (x + 5, y + cell_height - 8), font, 0.35, color, 1)
        
        # Confidence percentage
        conf_text = f"{confidence*100:.0f}%"
        cv2.putText(preview, conf_text, (x + cell_width - 40, y + cell_height - 8), font, 0.35, color, 1)
        
        # Border color based on confidence
        border_color = (0, 255, 0) if confidence >= CONFIDENCE_THRESHOLD else (50, 50, 50)
        cv2.rectangle(preview, (x, y), (x + cell_width - 1, y + cell_height - 1), border_color, 1)
    
    # Draw PAUSED overlay if paused
    if is_paused:
        overlay = preview.copy()
        h, w = preview.shape[:2]
        cv2.rectangle(overlay, (0, h//2 - 40), (w, h//2 + 40), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.8, preview, 0.2, 0, preview)
        cv2.putText(preview, "PAUSED", (w//2 - 100, h//2 + 15), 
                    cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 165, 255), 4)
    
    return preview

def recalibrate_slot(slot_name, window_title):
    """Open calibration window to recalibrate a single slot."""
    global click_point, mouse_pos, SCAN_REGIONS, scroll_delta
    
    cv2.namedWindow("Recalibrate Region")
    cv2.setMouseCallback("Recalibrate Region", mouse_callback)
    
    is_ban = 'ban' in slot_name
    box_w = BAN_SCAN_WIDTH if is_ban else SCAN_WIDTH
    box_h = BAN_SCAN_HEIGHT if is_ban else SCAN_HEIGHT
    
    # Use existing region size if available
    if slot_name in SCAN_REGIONS:
        box_w = SCAN_REGIONS[slot_name]['w']
        box_h = SCAN_REGIONS[slot_name]['h']
    
    print(f"\n📍 Recalibrating: {slot_name}")
    print("   Click to set position | Scroll to resize | ESC to cancel")
    
    click_point = None
    scroll_delta = 0
    
    while True:
        # Handle scroll wheel resize
        if scroll_delta != 0:
            box_w = max(20, min(200, box_w + scroll_delta))
            box_h = max(20, min(200, box_h + scroll_delta))
            scroll_delta = 0
        
        screenshot, win_info = capture_window(window_title)
        
        if screenshot is None:
            print(f"Window '{window_title}' not found.")
            cv2.destroyWindow("Recalibrate Region")
            return False
        
        display = screenshot.copy()
        h, w = display.shape[:2]
        
        # Draw existing region in red (old position)
        if slot_name in SCAN_REGIONS:
            old_region = SCAN_REGIONS[slot_name]
            cv2.rectangle(display, 
                         (old_region['rel_x'], old_region['rel_y']),
                         (old_region['rel_x'] + old_region['w'], old_region['rel_y'] + old_region['h']),
                         (0, 0, 255), 2)  # Red for old
        
        # Draw preview box at mouse position
        mx, my = mouse_pos
        if my > 50:
            preview_x = max(0, mx - box_w // 2)
            preview_y = max(0, my - box_h // 2)
            color = (255, 100, 0) if is_ban else (0, 255, 0)
            cv2.rectangle(display, (preview_x, preview_y), 
                         (preview_x + box_w, preview_y + box_h), color, 2)
            cv2.line(display, (mx - 10, my), (mx + 10, my), color, 1)
            cv2.line(display, (mx, my - 10), (mx, my + 10), color, 1)
        
        # Header
        overlay = display.copy()
        cv2.rectangle(overlay, (0, 0), (w, 50), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, display, 0.3, 0, display)
        
        slot_color = (255, 100, 0) if is_ban else (0, 255, 0)
        cv2.putText(display, f"Recalibrating: {slot_name} ({box_w}x{box_h})", (10, 25), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, slot_color, 2)
        cv2.putText(display, "Click=set | Scroll=resize | ESC=cancel", (10, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        cv2.imshow("Recalibrate Region", display)
        
        key = cv2.waitKey(50) & 0xFF
        
        if click_point is not None:
            x, y = click_point
            rel_x = max(0, x - box_w // 2)
            rel_y = max(0, y - box_h // 2)
            
            SCAN_REGIONS[slot_name] = {
                'rel_x': rel_x,
                'rel_y': rel_y,
                'w': box_w,
                'h': box_h
            }
            
            print(f"✅ {slot_name} updated: pos=({rel_x}, {rel_y}) size={box_w}x{box_h}")
            click_point = None
            cv2.destroyWindow("Recalibrate Region")
            return True
        
        if key == 27:  # ESC
            print("❌ Cancelled")
            cv2.destroyWindow("Recalibrate Region")
            return False
    
    return False

def recognition_loop(infer, classes):
    """Main loop for multi-region scanning."""
    global calibration_complete, paused, should_exit, edit_mode, edit_slot
    
    print("\n" + "=" * 60)
    print("🎮 Starting AI Bot Recognition Loop")
    print("=" * 60)
    print(f"📡 Scanning {len(SCAN_REGIONS)} regions simultaneously")
    print("📺 Live preview window controls:")
    print("   P - Pause/Resume recognition")
    print("   E - Edit mode (adjust regions)")
    print("   Q - Quit the entire app")
    print("=" * 60)
    print("\n📝 Edit mode keys:")
    print("   1-6: Select ban-1 to ban-6")
    print("   F1-F10: Select pick-1 to pick-10")
    print("=" * 60)
    
    calibration_complete = True
    
    with mss.mss() as sct:
        while True:
            window_pos = get_window_position()
            
            if not window_pos:
                print(f"⏳ Waiting for '{TARGET_WINDOW_TITLE}' window...")
                for history in prediction_histories.values():
                    history.clear()
                cv2.destroyAllWindows()
                time.sleep(2)
                continue
            
            frames = {}
            predictions = {}
            confidences = {}
            
            # Scan all regions
            for slot_name, region_config in SCAN_REGIONS.items():
                try:
                    monitor = get_region_monitor(window_pos, region_config)
                    frame = np.array(sct.grab(monitor))
                    frames[slot_name] = frame
                    
                    # Only run predictions if not paused
                    if not paused:
                        hero_name, confidence = predict_hero(frame, infer, classes)
                        
                        # Always store the prediction and confidence for display
                        predictions[slot_name] = hero_name
                        confidences[slot_name] = confidence
                        
                        # Only send if above threshold and stable
                        if hero_name and confidence >= CONFIDENCE_THRESHOLD:
                            prediction_histories[slot_name].append(hero_name)
                            stable_hero = get_stable_prediction(slot_name)
                            
                            if stable_hero:
                                send_prediction(slot_name, stable_hero)
                    else:
                        # When paused, show last known predictions
                        predictions[slot_name] = last_sent_heroes.get(slot_name)
                        confidences[slot_name] = 0.0
                        
                except Exception as e:
                    print(f"⚠️ Error scanning {slot_name}: {e}")
                    frames[slot_name] = None
                    predictions[slot_name] = None
                    confidences[slot_name] = 0.0
            
            # Show combined preview
            preview = create_multi_preview(frames, predictions, confidences, is_paused=paused)
            cv2.imshow("AI Multi-Scanner (P=pause, E=edit, Q=quit)", preview)
            
            # Use waitKeyEx to get full keycode including modifiers
            key_full = cv2.waitKeyEx(1)
            key = key_full & 0xFF
            
            # Always process Q, P, E regardless of edit mode
            if key == ord('q') or key == ord('Q'):
                cv2.destroyAllWindows()
                print("\n👋 Shutting down...")
                should_exit = True
                return  # Exit the recognition loop
            elif key == ord('p') or key == ord('P'):
                paused = not paused
                status = "⏸️ PAUSED" if paused else "▶️ RESUMED"
                print(status)
            elif key == ord('e') or key == ord('E'):
                edit_mode = not edit_mode
                if edit_mode:
                    print("\n✏️ EDIT MODE ON")
                    print("   Shift+1-6: Adjust ban-1 to ban-6")
                    print("   1-0: Adjust pick-1 to pick-10")
                else:
                    print("✏️ EDIT MODE OFF")
            elif edit_mode:
                # Shift+1-6 for bans (produces ! @ # $ % ^)
                ban_keys = {'!': 1, '@': 2, '#': 3, '$': 4, '%': 5, '^': 6}
                if key > 0 and chr(key) in ban_keys:
                    slot_num = ban_keys[chr(key)]
                    slot_name = f'ban-{slot_num}'
                    if slot_name in SCAN_REGIONS:
                        recalibrate_slot(slot_name, TARGET_WINDOW_TITLE)
                # Number keys 1-9 for picks 1-9
                elif key >= ord('1') and key <= ord('9'):
                    pick_num = key - ord('0')
                    slot_name = f'pick-{pick_num}'
                    if slot_name in SCAN_REGIONS:
                        recalibrate_slot(slot_name, TARGET_WINDOW_TITLE)
                # 0 for pick-10
                elif key == ord('0'):
                    slot_name = 'pick-10'
                    if slot_name in SCAN_REGIONS:
                        recalibrate_slot(slot_name, TARGET_WINDOW_TITLE)
            
            time.sleep(0.2)

# ============================================================
# MAIN WORKFLOW
# ============================================================
def main():
    global TARGET_WINDOW_TITLE, SCAN_REGIONS, last_sent_heroes, prediction_histories
    
    print("=" * 60)
    print("🤖 MLBB AI Bot with Integrated Calibration")
    print("=" * 60)
    print()
    print("This tool will guide you through:")
    print("  1. Window selection")
    print("  2. Region calibration (6 bans + 10 picks)")
    print("  3. Automatic AI bot startup")
    print()
    print("No manual config editing needed!")
    print("=" * 60)
    
    # Step 1: Select window
    TARGET_WINDOW_TITLE = select_window()
    print(f"\n✅ Selected window: {TARGET_WINDOW_TITLE}")
    
    # Step 2: Run calibration
    print("\n🎯 Starting calibration...")
    regions, win_info = run_calibration(TARGET_WINDOW_TITLE)
    
    # Check if user quit during calibration
    if regions is None or win_info is None:
        print("👋 Exiting...")
        return
    
    if not regions:
        print("❌ No regions calibrated. Exiting.")
        return
    
    if len(regions) < 16:
        print(f"⚠️ Warning: Only {len(regions)} out of 16 regions calibrated.")
        print("Some slots will not be scanned.")
    
    SCAN_REGIONS = regions
    print(f"\n✅ Calibration complete! Configured {len(SCAN_REGIONS)} regions")
    
    # Initialize tracking for each slot
    last_sent_heroes = {slot: None for slot in SCAN_REGIONS.keys()}
    prediction_histories = {slot: deque(maxlen=5) for slot in SCAN_REGIONS.keys()}
    
    # Step 3: Load AI model and classes
    print("\n🤖 Loading AI model...")
    classes = load_classes()
    if not classes:
        print("❌ Failed to load hero classes. Exiting.")
        return
    
    model, infer = load_model()
    
    # Step 4: Start AI bot
    print("\n🚀 Starting AI Bot...")
    print("=" * 60)
    print(f"📡 WebSocket: {WS_URL}")
    print(f"🎯 Window: '{TARGET_WINDOW_TITLE}'")
    print(f"📦 Classes: {len(classes)} heroes")
    print(f"🔍 Scanners: {len(SCAN_REGIONS)} regions")
    print("=" * 60)
    
    # Start recognition thread
    t = threading.Thread(target=recognition_loop, args=(infer, classes), daemon=True)
    t.start()
    
    # Wait for calibration to complete before starting WebSocket
    while not calibration_complete:
        time.sleep(0.1)
    
    # WebSocket connection with auto-reconnect
    websocket.enableTrace(False)
    
    global ws
    while not should_exit:
        try:
            ws = websocket.WebSocketApp(
                WS_URL,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            # Run with shorter timeout to check should_exit more frequently
            ws.run_forever(ping_interval=30, ping_timeout=10)
            
            if should_exit:
                break
                
            print("🔄 Reconnecting in 3 seconds...")
            time.sleep(3)
        except KeyboardInterrupt:
            print("\n👋 Shutting down...")
            break
        except Exception as e:
            if should_exit:
                break
            print(f"❌ Connection error: {e}")
            time.sleep(5)
    
    # Cleanup
    cv2.destroyAllWindows()
    print("✅ App terminated.")

if __name__ == "__main__":
    main()
