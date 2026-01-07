"""
Multi-Scanner Calibration Tool for MLBB Hero Recognition

This tool helps you define the 16 scan regions for the multi-scanner AI bot.
Use it to click and define each ban/pick region on your screen.

Usage:
1. Run this script
2. Open your MLBB draft screen capture
3. Follow the prompts to click on each region
4. Copy the generated SCAN_REGIONS config to ai_bot_multi.py
"""

import cv2
import numpy as np
import mss
import pygetwindow as gw
import json

# Configuration
SCAN_WIDTH = 100  # Width of each scan region
SCAN_HEIGHT = 100  # Height of each scan region

# Define the slots in order
SLOTS = [
    'ban-1', 'ban-2', 'ban-3',  # Blue bans
    'ban-4', 'ban-5', 'ban-6',  # Red bans
    'pick-1', 'pick-2', 'pick-3', 'pick-4', 'pick-5',  # Blue picks
    'pick-6', 'pick-7', 'pick-8', 'pick-9', 'pick-10'  # Red picks
]

# Storage for calibrated regions
calibrated_regions = {}
current_slot_index = 0
click_point = None
window_info = None

def mouse_callback(event, x, y, flags, param):
    global click_point
    if event == cv2.EVENT_LBUTTONDOWN:
        click_point = (x, y)

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
            
            # Try as number first
            if choice.isdigit():
                idx = int(choice)
                if 0 <= idx < len(windows):
                    return windows[idx]
            
            # Try as partial title match
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
        
        # Capture the window
        with mss.mss() as sct:
            monitor = {
                "left": win.left,
                "top": win.top,
                "width": win.width,
                "height": win.height
            }
            screenshot = np.array(sct.grab(monitor))
            # Convert BGRA to BGR
            screenshot = cv2.cvtColor(screenshot, cv2.COLOR_BGRA2BGR)
            return screenshot, window_info
            
    except Exception as e:
        print(f"Error capturing window: {e}")
        return None, None

def draw_calibration_ui(frame, slot_name, regions_so_far):
    """Draw the calibration UI overlay."""
    display = frame.copy()
    h, w = display.shape[:2]
    
    # Draw existing regions
    for name, region in regions_so_far.items():
        x = region['rel_x']
        y = region['rel_y']
        rw = region['w']
        rh = region['h']
        
        # Color based on type
        color = (255, 100, 0) if 'ban' in name else (0, 255, 0)
        cv2.rectangle(display, (x, y), (x + rw, y + rh), color, 2)
        cv2.putText(display, name, (x + 5, y + 20), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
    
    # Draw instruction overlay
    overlay = display.copy()
    cv2.rectangle(overlay, (0, 0), (w, 60), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.7, display, 0.3, 0, display)
    
    # Instructions
    is_ban = 'ban' in slot_name
    slot_color = (255, 100, 0) if is_ban else (0, 255, 0)
    
    cv2.putText(display, f"Click to set: {slot_name}", (10, 25), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, slot_color, 2)
    cv2.putText(display, "Press 'S' to skip | 'R' to restart | 'Q' to quit", (10, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    # Progress
    progress = f"Progress: {len(regions_so_far)}/16"
    cv2.putText(display, progress, (w - 150, 25), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    
    return display

def run_calibration(window_title):
    """Run the calibration process."""
    global click_point, current_slot_index, calibrated_regions
    
    cv2.namedWindow("Multi-Scanner Calibration")
    cv2.setMouseCallback("Multi-Scanner Calibration", mouse_callback)
    
    print("\n" + "=" * 60)
    print("CALIBRATION MODE")
    print("=" * 60)
    print("Click on the CENTER of each hero portrait region")
    print("The region will be drawn as a box around your click point")
    print()
    print("Controls:")
    print("  LEFT CLICK - Set region for current slot")
    print("  S - Skip current slot")
    print("  R - Restart calibration")
    print("  Q - Quit and save")
    print("=" * 60)
    
    current_slot_index = 0
    
    while current_slot_index < len(SLOTS):
        screenshot, win_info = capture_window(window_title)
        
        if screenshot is None:
            print(f"Window '{window_title}' not found. Waiting...")
            cv2.waitKey(1000)
            continue
        
        slot_name = SLOTS[current_slot_index]
        display = draw_calibration_ui(screenshot, slot_name, calibrated_regions)
        
        cv2.imshow("Multi-Scanner Calibration", display)
        
        key = cv2.waitKey(50) & 0xFF
        
        # Handle click
        if click_point is not None:
            x, y = click_point
            
            # Calculate region centered on click
            rel_x = max(0, x - SCAN_WIDTH // 2)
            rel_y = max(0, y - SCAN_HEIGHT // 2)
            
            calibrated_regions[slot_name] = {
                'rel_x': rel_x,
                'rel_y': rel_y,
                'w': SCAN_WIDTH,
                'h': SCAN_HEIGHT
            }
            
            print(f"✅ {slot_name}: ({rel_x}, {rel_y})")
            current_slot_index += 1
            click_point = None
        
        # Handle keys
        if key == ord('s'):  # Skip
            print(f"⏭️ Skipped: {slot_name}")
            current_slot_index += 1
        elif key == ord('r'):  # Restart
            print("🔄 Restarting calibration...")
            calibrated_regions.clear()
            current_slot_index = 0
        elif key == ord('q'):  # Quit
            break
    
    cv2.destroyAllWindows()
    return calibrated_regions, window_info

def generate_config(regions, window_info):
    """Generate the Python config code."""
    output = []
    output.append("\n" + "=" * 60)
    output.append("COPY THIS TO ai_bot_multi.py:")
    output.append("=" * 60)
    output.append("")
    output.append(f'TARGET_WINDOW_TITLE = "{window_info["title"]}"')
    output.append("")
    output.append("SCAN_REGIONS = {")
    
    for slot_name in SLOTS:
        if slot_name in regions:
            r = regions[slot_name]
            output.append(f"    '{slot_name}': {{'rel_x': {r['rel_x']}, 'rel_y': {r['rel_y']}, 'w': {r['w']}, 'h': {r['h']}}},")
        else:
            output.append(f"    # '{slot_name}': SKIPPED")
    
    output.append("}")
    output.append("")
    output.append("=" * 60)
    
    return "\n".join(output)

def main():
    print("=" * 60)
    print("🎮 MLBB Multi-Scanner Calibration Tool")
    print("=" * 60)
    print()
    print("This tool helps you define the 16 scan regions")
    print("(6 bans + 10 picks) for the multi-scanner AI bot.")
    print()
    
    # Select window
    window_title = select_window()
    print(f"\n✅ Selected window: {window_title}")
    
    # Run calibration
    regions, window_info = run_calibration(window_title)
    
    if regions and window_info:
        config = generate_config(regions, window_info)
        print(config)
        
        # Save to file
        with open("calibration_multi_config.txt", "w") as f:
            f.write(config)
        print("💾 Config also saved to: calibration_multi_config.txt")
    else:
        print("❌ Calibration incomplete or cancelled.")

if __name__ == "__main__":
    main()
