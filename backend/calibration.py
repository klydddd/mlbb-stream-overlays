import pygetwindow as gw
import mss
import cv2
import numpy as np


def list_windows():
    """List all available windows with titles."""
    print("--- Available Windows ---")
    titles = [w.title for w in gw.getAllWindows() if w.title.strip()]
    for i, t in enumerate(titles, 1):
        print(f"  {i}. {t}")
    print("-------------------------")


def get_window_region(window_title):
    """Find a window by partial title match."""
    try:
        windows = gw.getWindowsWithTitle(window_title)
        if windows:
            return windows[0]
        return None
    except Exception:
        return None


def draw_info_overlay(img, rel_x, rel_y, w, h, step_size, win_info):
    """Draw information overlay on the preview image."""
    overlay = img.copy()
    
    # Draw a semi-transparent background for text
    cv2.rectangle(overlay, (5, 5), (320, 150), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.6, img, 0.4, 0, img)
    
    # Draw text information
    font = cv2.FONT_HERSHEY_SIMPLEX
    color = (0, 255, 0)  # Green
    gray = (180, 180, 180)
    
    cv2.putText(img, f"Crop Offset: ({rel_x}, {rel_y})", (10, 25), font, 0.5, color, 1)
    cv2.putText(img, f"Crop Size: {w} x {h}", (10, 50), font, 0.5, color, 1)
    cv2.putText(img, f"Step: {step_size}px  (+/- to change)", (10, 75), font, 0.5, color, 1)
    cv2.putText(img, f"Window: {win_info}", (10, 100), font, 0.4, gray, 1)
    cv2.putText(img, "WASD=Move | IJKL=Resize | Q=Save", (10, 125), font, 0.4, gray, 1)
    cv2.putText(img, "R=Reset Position | ESC=Cancel", (10, 145), font, 0.4, gray, 1)
    
    return img


def main():
    # 1. Select the Window
    list_windows()
    target_title = input("\nEnter a part of your emulator window title (e.g. 'MuMu'): ").strip()
    
    if not target_title:
        print("❌ No window title entered!")
        return
    
    win = get_window_region(target_title)
    if not win:
        print("❌ Window not found! Make sure it is open.")
        return

    print(f"✅ Locked onto: {win.title}")
    print(f"   Window Position: ({win.left}, {win.top})")
    print(f"   Window Size: {win.width} x {win.height}")
    
    print("\n--- Controls ---")
    print(" [W/A/S/D] Move Crop Area")
    print(" [I/J/K/L] Resize Crop Area")
    print(" [+/-]     Increase/Decrease step size")
    print(" [R]       Reset to center of window")
    print(" [Q]       Quit & Save configuration")
    print(" [ESC]     Cancel without saving")
    print("----------------\n")

    # 2. Initial Relative Offsets - start at center of the window
    # Calculate initial position to be roughly centered in the window
    initial_w = min(300, win.width - 20)
    initial_h = min(300, win.height - 20)
    rel_x = max(10, (win.width - initial_w) // 2)
    rel_y = max(10, (win.height - initial_h) // 2)
    w = initial_w
    h = initial_h
    step_size = 5  # Adjustable step size
    
    # Minimum dimensions
    MIN_SIZE = 50

    with mss.mss() as sct:
        while True:
            # Update window position in real-time (in case you drag the window)
            current_win = get_window_region(target_title)
            
            if current_win is None:
                print("⚠️ Window lost! Waiting for it to reappear...")
                cv2.waitKey(500)
                continue
            
            if current_win.isMinimized:
                print("⚠️ Window is minimized. Please restore it.")
                cv2.waitKey(500)
                continue
            
            # Get window's absolute screen position
            win_left = current_win.left
            win_top = current_win.top
            win_width = current_win.width
            win_height = current_win.height

            # Calculate the absolute screen coordinates for capture
            abs_left = win_left + rel_x
            abs_top = win_top + rel_y
            
            # Ensure minimum size
            capture_w = max(w, MIN_SIZE)
            capture_h = max(h, MIN_SIZE)

            # Create monitor definition for mss
            monitor = {
                "top": abs_top,
                "left": abs_left,
                "width": capture_w,
                "height": capture_h
            }
            
            # Debug: print monitor info occasionally
            # print(f"Monitor: {monitor}")

            try:
                # Capture the screen region
                screenshot = sct.grab(monitor)
                img = np.array(screenshot)
                
                # Convert BGRA to BGR for OpenCV display
                if img.shape[2] == 4:
                    img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
                
                # Draw info overlay
                win_info = f"({win_left},{win_top}) {win_width}x{win_height}"
                img = draw_info_overlay(img, rel_x, rel_y, w, h, step_size, win_info)
                
                # Display
                cv2.imshow("AI Vision Calibration - Press Q to Save, ESC to Cancel", img)
                
            except Exception as e:
                print(f"⚠️ Capture error: {e}")
                print(f"   Monitor config: {monitor}")
                cv2.waitKey(500)
                continue
            
            # Handle Inputs for adjusting the box
            key = cv2.waitKey(20) & 0xFF
            
            # Position (WASD)
            if key == ord('w'):
                rel_y -= step_size
            elif key == ord('s'):
                rel_y += step_size
            elif key == ord('a'):
                rel_x -= step_size
            elif key == ord('d'):
                rel_x += step_size
            
            # Size (IJKL)
            elif key == ord('i'):
                h = max(h - step_size, MIN_SIZE)
            elif key == ord('k'):
                h += step_size
            elif key == ord('j'):
                w = max(w - step_size, MIN_SIZE)
            elif key == ord('l'):
                w += step_size
            
            # Step size adjustment
            elif key == ord('+') or key == ord('='):
                step_size = min(step_size + 5, 50)
                print(f"Step size: {step_size}px")
            elif key == ord('-') or key == ord('_'):
                step_size = max(step_size - 5, 1)
                print(f"Step size: {step_size}px")
            
            # Reset to center
            elif key == ord('r'):
                rel_x = max(10, (win_width - w) // 2)
                rel_y = max(10, (win_height - h) // 2)
                print(f"Reset to center: ({rel_x}, {rel_y})")

            # Save and quit
            elif key == ord('q'):
                print("\n" + "=" * 50)
                print("💾 COPY THIS CONFIGURATION TO AI_BOT.PY")
                print("=" * 50)
                print(f'TARGET_WINDOW_TITLE = "{target_title}"')
                print(f"CROP_CONFIG = {{'rel_x': {rel_x}, 'rel_y': {rel_y}, 'w': {w}, 'h': {h}}}")
                print("=" * 50)
                print("\n✅ Calibration saved!")
                break
            
            # Cancel
            elif key == 27:  # ESC key
                print("\n❌ Calibration cancelled.")
                break

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()