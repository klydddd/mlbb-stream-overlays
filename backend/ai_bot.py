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
TARGET_WINDOW_TITLE = "akai.png"
CROP_CONFIG = {'rel_x': 337, 'rel_y': 111, 'w': 300, 'h': 300}

# Model input configuration
MODEL_INPUT_SIZE = (224, 224)  # Standard input size, adjust if your model uses different dimensions

# Model path (absolute path based on script location)
MODEL_PATH = os.path.join(SCRIPT_DIR, "mlbb_hero_model_pro")
LABELS_PATH = os.path.join(MODEL_PATH, "labels.txt")

# Load hero classes from labels.txt (must match your model's training order exactly)
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

# Confidence threshold for predictions
CONFIDENCE_THRESHOLD = 0.7

# --- STATE ---
prediction_history = deque(maxlen=10)
last_sent_hero = None
ws = None

# --- LOAD MODEL ---
print(f"Loading Model from: {MODEL_PATH}")
try:
    model = tf.saved_model.load(MODEL_PATH)
    # Get the inference function
    infer = model.signatures["serving_default"]
    print("✅ Model Loaded Successfully!")
except Exception as e:
    print(f"❌ Failed to load model: {e}")
    print("Make sure the model exists at: python/mlbb_hero_model_pro/")
    exit(1)


def on_open(ws_conn):
    print(f"✅ AI Bot Connected to {WS_URL}")


def on_message(ws_conn, message):
    """Handle incoming messages from the server."""
    try:
        data = json.loads(message)
        print(f"📨 Received: {data.get('type', 'unknown')}")
    except json.JSONDecodeError:
        pass  # Ignore non-JSON messages


def on_error(ws_conn, error):
    if error:
        print(f"❌ WebSocket Error: {error}")
    else:
        print("❌ WebSocket connection lost")


def on_close(ws_conn, close_status_code, close_msg):
    print(f"⚠️ Disconnected (Code: {close_status_code}, Msg: {close_msg})")
    print("🔄 Will attempt to reconnect...")


def send_prediction(hero_name):
    """Send a hero prediction to the WebSocket server."""
    global last_sent_hero, ws

    # Don't spam the server if it's the same hero
    if hero_name == last_sent_hero:
        return

    if ws is None:
        print("⚠️ WebSocket not connected, cannot send prediction")
        return

    payload = {
        "type": "ai_prediction",
        "data": {
            "name": hero_name
        }
    }
    try:
        ws.send(json.dumps(payload))
        print(f"🚀 Sent Prediction: {hero_name}")
        last_sent_hero = hero_name
    except Exception as e:
        print(f"❌ Failed to send prediction: {e}")


def get_dynamic_monitor():
    """Get the screen region to capture based on the game window position."""
    try:
        wins = gw.getWindowsWithTitle(TARGET_WINDOW_TITLE)
        if not wins:
            return None
        win = wins[0]

        # Ensure window is not minimized
        if win.isMinimized:
            return None

        return {
            "top": win.top + CROP_CONFIG['rel_y'],
            "left": win.left + CROP_CONFIG['rel_x'],
            "width": CROP_CONFIG['w'],
            "height": CROP_CONFIG['h']
        }
    except Exception as e:
        print(f"⚠️ Error getting window: {e}")
        return None


def preprocess_frame(frame):
    """Preprocess the captured frame for model inference.
    
    Note: Matches tester.py preprocessing - model expects 0-255 pixel values,
    NOT normalized 0-1 values.
    """
    # Convert BGRA to RGB (mss captures in BGRA format)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2RGB)

    # Resize to model input size
    resized = cv2.resize(rgb_frame, MODEL_INPUT_SIZE)

    # Convert to float32 (keep 0-255 range, matching tester.py)
    # DO NOT normalize to 0-1 - the model was trained with 0-255 values
    float_frame = resized.astype(np.float32)

    # Add batch dimension
    batched = np.expand_dims(float_frame, axis=0)

    return batched


def predict_hero(frame):
    """Run inference on a frame and return the predicted hero name."""
    try:
        # Preprocess the frame
        input_tensor = preprocess_frame(frame)

        # Explicitly try to use GPU if available, otherwise use CPU
        gpus = tf.config.list_physical_devices('GPU')
        device_name = '/GPU:0' if gpus else '/CPU:0'
        
        with tf.device(device_name):
            # Convert to TensorFlow tensor
            input_tf = tf.constant(input_tensor)

            # Run inference
            predictions = infer(input_tf)

            # Get the output tensor (the key may vary depending on your model)
            # Common keys: 'output_0', 'predictions', 'dense', etc.
            output_key = list(predictions.keys())[0]
            output = predictions[output_key].numpy()[0]

            # Get the predicted class and confidence
            predicted_idx = np.argmax(output)
            confidence = output[predicted_idx]

        if confidence >= CONFIDENCE_THRESHOLD and predicted_idx < len(CLASSES):
            return CLASSES[predicted_idx], confidence
        else:
            return None, confidence

    except Exception as e:
        print(f"⚠️ Prediction error: {e}")
        return None, 0.0


def get_stable_prediction():
    """Get a stable prediction based on recent history to reduce flickering."""
    if len(prediction_history) < 3:
        return None

    # Count occurrences of each prediction
    from collections import Counter
    counts = Counter(prediction_history)
    most_common = counts.most_common(1)[0]

    # Only return if the most common prediction appears in at least 50% of history
    if most_common[1] >= len(prediction_history) * 0.5:
        return most_common[0]

    return None


def draw_preview(frame, hero_name, confidence, stable_hero):
    """Draw prediction info overlay on the frame for preview."""
    # Convert BGRA to BGR for OpenCV display
    if frame.shape[2] == 4:
        display_frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
    else:
        display_frame = frame.copy()
    
    # Resize for display if too large
    h, w = display_frame.shape[:2]
    max_height = 500
    if h > max_height:
        scale = max_height / h
        display_frame = cv2.resize(display_frame, (int(w * scale), int(h * scale)))
    
    h, w = display_frame.shape[:2]
    
    # Draw semi-transparent overlay background
    overlay = display_frame.copy()
    cv2.rectangle(overlay, (5, 5), (w - 5, 100), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, display_frame, 0.4, 0, display_frame)
    
    # Colors
    green = (0, 255, 0)
    yellow = (0, 255, 255)
    red = (0, 0, 255)
    white = (255, 255, 255)
    
    font = cv2.FONT_HERSHEY_SIMPLEX
    
    # Determine color based on confidence
    if confidence >= CONFIDENCE_THRESHOLD:
        conf_color = green
    elif confidence >= CONFIDENCE_THRESHOLD * 0.8:
        conf_color = yellow
    else:
        conf_color = red
    
    # Draw detected hero name
    if hero_name:
        cv2.putText(display_frame, f"Detected: {hero_name}", (10, 30), font, 0.7, conf_color, 2)
    else:
        cv2.putText(display_frame, "Detected: (low confidence)", (10, 30), font, 0.7, red, 2)
    
    # Draw confidence bar
    bar_width = w - 20
    bar_height = 20
    bar_x = 10
    bar_y = 45
    
    # Background bar
    cv2.rectangle(display_frame, (bar_x, bar_y), (bar_x + bar_width, bar_y + bar_height), (50, 50, 50), -1)
    
    # Confidence fill
    fill_width = int(bar_width * confidence)
    cv2.rectangle(display_frame, (bar_x, bar_y), (bar_x + fill_width, bar_y + bar_height), conf_color, -1)
    
    # Threshold line
    threshold_x = bar_x + int(bar_width * CONFIDENCE_THRESHOLD)
    cv2.line(display_frame, (threshold_x, bar_y - 5), (threshold_x, bar_y + bar_height + 5), white, 2)
    
    # Confidence text
    cv2.putText(display_frame, f"{confidence:.1%}", (bar_x + bar_width - 60, bar_y + 15), font, 0.5, white, 1)
    
    # Draw stable prediction
    if stable_hero:
        cv2.putText(display_frame, f"Stable: {stable_hero}", (10, 85), font, 0.6, green, 2)
        cv2.putText(display_frame, "SENDING", (w - 100, 85), font, 0.5, green, 2)
    else:
        cv2.putText(display_frame, "Stable: waiting...", (10, 85), font, 0.6, yellow, 1)
    
    return display_frame


def recognition_loop():
    """Main loop for capturing screen and running predictions."""
    global prediction_history

    print("🎮 Starting recognition loop...")
    print("📺 Live preview window opening... (Press 'Q' in the preview window to close it)")

    with mss.mss() as sct:
        while True:
            # 1. Get Dynamic Region
            monitor = get_dynamic_monitor()

            if monitor:
                try:
                    # 2. Capture the screen region
                    frame = np.array(sct.grab(monitor))

                    # 3. Run prediction
                    hero_name, confidence = predict_hero(frame)

                    # Initialize stable_hero
                    stable_hero = None

                    if hero_name:
                        # Add to history for stability
                        prediction_history.append(hero_name)

                        # Get stable prediction
                        stable_hero = get_stable_prediction()

                        if stable_hero:
                            # Send to WebSocket
                            send_prediction(stable_hero)

                        # Debug output - show what's being detected
                        print(f"🔍 Detected: {hero_name} ({confidence:.2%}) | Stable: {stable_hero or 'waiting...'}")
                    else:
                        # Low confidence or no detection
                        if confidence > 0:
                            print(f"Detected: None ❓ Low confidence: {confidence:.2%} (threshold: {CONFIDENCE_THRESHOLD:.0%}) ")

                    # 4. Show live preview window
                    preview = draw_preview(frame, hero_name, confidence, stable_hero)
                    cv2.imshow("AI Bot - Live Preview (Press Q to close)", preview)
                    
                    # Check for 'q' key to close preview (non-blocking)
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('q'):
                        cv2.destroyAllWindows()
                        print("📺 Preview window closed")

                except Exception as e:
                    print(f"⚠️ Capture/Processing error: {e}")

            else:
                print(f"⏳ Waiting for '{TARGET_WINDOW_TITLE}' window...")
                prediction_history.clear()  # Clear history when window is lost
                cv2.destroyAllWindows()  # Close preview when window is lost
                time.sleep(2)  # Don't spam CPU if window is closed
                continue

            # Small delay to prevent excessive CPU usage
            time.sleep(0.1)


if __name__ == "__main__":
    print("=" * 50)
    print("🤖 MLBB AI Hero Recognition Bot")
    print("=" * 50)
    print(f"📡 Connecting to: {WS_URL}")
    print(f"🎯 Tracking window: '{TARGET_WINDOW_TITLE}'")
    print(f"📦 Loaded {len(CLASSES)} hero classes")
    print("=" * 50)
    print("\n💡 TIP: Run calibration.py first to configure TARGET_WINDOW_TITLE and CROP_CONFIG\n")

    # Start the recognition in a background thread
    t = threading.Thread(target=recognition_loop, daemon=True)
    t.start()

    # Start WebSocket connection with auto-reconnect
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
            
            # Run with ping interval to keep connection alive
            ws.run_forever(ping_interval=30, ping_timeout=10)
            
            # If we get here, connection was lost - wait and retry
            print("🔄 Reconnecting in 3 seconds...")
            time.sleep(3)
            
        except KeyboardInterrupt:
            print("\n👋 Shutting down...")
            break
        except Exception as e:
            print(f"❌ Connection error: {e}")
            print("🔄 Retrying in 5 seconds...")
            time.sleep(5)