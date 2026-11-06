"""
MLBB in-game stats reader.

Reads each team's kills, lord, tower and gold counts off the spectator top bar
and sends them to gameDisplay.html through the WebSocket relay room.

The numbers are small, so this does not use general OCR. The game draws every digit
in the same font, so each number is cut into single characters and each one is
compared with example characters ("templates") in ingame_templates/.

Built-in templates ship with the bot: digits 0-9 drawn in four fonts that match the HUD
font (Arial, Arial Bold, Arial Rounded Bold, Helvetica Neue; *_font-*.png) plus digits
cut from real HUD footage (*_hud-*.png). No labelling is needed.

Workflow (run from backend/):
  1. python ingame_stats_bot.py calibrate   drag a box around each number
  2. python ingame_stats_bot.py run         read and send (add --debug to watch it work)
Optional: `templates` labels extra real examples if some digit keeps reading as "unsure".

Every mode accepts --image <screenshot.png> to work from a saved screenshot instead
of a live window, which is handy for setting things up away from the stream PC.
`run --dry-run` prints the messages instead of sending them.

Message sent (only confirmed values, on every change and every few seconds):
  {"type": "ingame-stats", "stats": {"blue": {"kills": 5, "lord": 0, "tower": 2, "gold": 23400},
                                      "red":  {...}}}
"""

import argparse
import glob
import json
import os
import random
import re
import string
import sys
import threading
import time

import cv2
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, "ingame_stats_config.json")
TEMPLATE_DIR = os.path.join(SCRIPT_DIR, "ingame_templates")

SIDES = ("blue", "red")
STATS = ("kills", "lord", "tower", "gold")
REGION_NAMES = [f"{side}-{stat}" for side in SIDES for stat in STATS]
GLYPH_LABELS = list("0123456789k")

# ---------- reading ----------
SCALE = 4                  # enlarge each crop before thresholding
GLYPH_H, GLYPH_W = 32, 32  # every character is normalised onto this canvas
MIN_COMPONENT_AREA = 20    # in enlarged pixels; smaller blobs are noise
CHAR_WIDTH_RATIO = 0.62    # typical character width / height for this font
MAX_SINGLE_RATIO = 0.95    # a blob wider than this (x height) is treated as touching characters
MATCH_THRESHOLD = 0.75     # a character scoring below this rejects the whole read
MIN_MARGIN = 0.05          # best digit must beat the next-best different digit by this much
DUPLICATE_SCORE = 0.93     # templates mode skips characters already matched this well

# ---------- filtering ----------
AGREE_READS = 3            # same value this many reads in a row before it is accepted
UNUSUAL_READS = 16         # ...or this many for a drop or a big jump (e.g. a new game)
# stat: (lowest, highest, largest normal increase in one step)
LIMITS = {
    "kills": (0, 200, 5),   # a teamfight can add several at once
    "lord": (0, 10, 1),
    "tower": (0, 11, 3),
    "gold": (0, 500_000, 15_000),
}

DEFAULT_FPS = 4
HEARTBEAT_SECONDS = 5      # resend everything so a reloaded overlay catches up


# ============================================================
# Capture
# ============================================================

try:
    import mss
except ImportError:
    mss = None

try:
    import pygetwindow as gw
    gw.getAllTitles()  # raises on platforms pygetwindow does not support
except Exception:
    gw = None

try:
    import ctypes
    from ctypes import wintypes

    import win32gui
    import win32ui

    _PrintWindow = ctypes.windll.user32.PrintWindow
    _PrintWindow.argtypes = [wintypes.HWND, wintypes.HDC, wintypes.UINT]
    _PrintWindow.restype = wintypes.BOOL
    DIRECT_CAPTURE = True
except Exception:
    DIRECT_CAPTURE = False


try:
    import Quartz  # pyobjc-framework-Quartz (macOS)

    MAC_CAPTURE = True
except Exception:
    MAC_CAPTURE = False


def mac_windows():
    """[(window id, 'App — Window title')] for normal on-screen windows, front to back."""
    opts = Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements
    out = []
    for w in Quartz.CGWindowListCopyWindowInfo(opts, Quartz.kCGNullWindowID) or []:
        if w.get("kCGWindowLayer") != 0:
            continue
        owner, name = w.get("kCGWindowOwnerName") or "", w.get("kCGWindowName") or ""
        out.append((w["kCGWindowNumber"], f"{owner} — {name}" if name else owner))
    return out


def find_mac_window(title):
    """Window id for a saved title. Window titles change (browser tabs, OBS scenes), so
    fall back to the same app if the exact title is gone and that app has one window."""
    wins = mac_windows()
    for wid, t in wins:
        if t == title:
            return wid
    owner = title.split(" — ")[0]
    same_app = [wid for wid, t in wins if t.split(" — ")[0] == owner]
    return same_app[0] if len(same_app) == 1 else None


def capture_mac_window(wid):
    """One window's own pixels, even when other windows cover it (not when minimised)."""
    img = Quartz.CGWindowListCreateImage(
        Quartz.CGRectNull, Quartz.kCGWindowListOptionIncludingWindow, wid,
        Quartz.kCGWindowImageBoundsIgnoreFraming)
    if img is None:
        return None
    w, h = Quartz.CGImageGetWidth(img), Quartz.CGImageGetHeight(img)
    if w == 0 or h == 0:
        return None
    row = Quartz.CGImageGetBytesPerRow(img)
    data = Quartz.CGDataProviderCopyData(Quartz.CGImageGetDataProvider(img))
    # CoreGraphics hands back BGRA rows, padded to bytes-per-row
    return np.frombuffer(data, np.uint8).reshape(h, row // 4, 4)[:, :w, :3].copy()


def capture_hwnd(hwnd):
    """Window contents via PrintWindow, so windows on top of it don't get in the way."""
    left, top, right, bottom = win32gui.GetWindowRect(hwnd)
    width, height = right - left, bottom - top
    if width <= 0 or height <= 0:
        return None
    hwnd_dc = win32gui.GetWindowDC(hwnd)
    mfc_dc = win32ui.CreateDCFromHandle(hwnd_dc)
    save_dc = mfc_dc.CreateCompatibleDC()
    bitmap = win32ui.CreateBitmap()
    try:
        bitmap.CreateCompatibleBitmap(mfc_dc, width, height)
        save_dc.SelectObject(bitmap)
        if not _PrintWindow(hwnd, save_dc.GetSafeHdc(), 2):  # 2 = PW_RENDERFULLCONTENT
            _PrintWindow(hwnd, save_dc.GetSafeHdc(), 0)
        info = bitmap.GetInfo()
        img = np.frombuffer(bitmap.GetBitmapBits(True), dtype=np.uint8)
        img = img.reshape((info["bmHeight"], info["bmWidth"], 4))
        return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    finally:
        win32gui.DeleteObject(bitmap.GetHandle())
        save_dc.DeleteDC()
        mfc_dc.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwnd_dc)


class Source:
    """Where frames come from: a saved screenshot, a window, or the whole primary monitor."""

    def __init__(self, image=None, window=None):
        self.image = None
        self.window = window
        self.mac_id = None
        self.sct = None
        if image:
            self.image = cv2.imread(image)
            if self.image is None:
                sys.exit(f"Could not read image: {image}")
        elif window and gw is None and not MAC_CAPTURE:
            print("Window capture isn't available here; capturing the primary monitor instead.")
            if sys.platform == "darwin":
                print("  On macOS: pip install pyobjc-framework-Quartz")
            self.window = None
        if self.image is None and mss is not None:
            self.sct = (getattr(mss, "MSS", None) or mss.mss)()

    def describe(self):
        if self.image is not None:
            return "screenshot"
        return f"window '{self.window}'" if self.window else "primary monitor"

    def grab(self):
        if self.image is not None:
            return self.image.copy()
        if self.window and gw is None and MAC_CAPTURE:
            img = capture_mac_window(self.mac_id) if self.mac_id else None
            if img is None:  # first grab, or the window was closed and reopened
                self.mac_id = find_mac_window(self.window)
                img = capture_mac_window(self.mac_id) if self.mac_id else None
            return img
        if self.window:
            wins = gw.getWindowsWithTitle(self.window)
            if not wins:
                return None
            win = wins[0]
            if DIRECT_CAPTURE:
                img = capture_hwnd(win._hWnd)
                if img is not None:
                    return img
            box = {"left": win.left, "top": win.top, "width": win.width, "height": win.height}
        else:
            box = self.sct.monitors[1]
        if self.sct is None:
            sys.exit("Screen capture needs the mss package (pip install mss).")
        return cv2.cvtColor(np.array(self.sct.grab(box)), cv2.COLOR_BGRA2BGR)


BLANK_HELP = (
    "The capture came back as one flat colour, so the screen isn't really being captured.\n"
    "On macOS this means the app running this script has no Screen Recording permission:\n"
    "  System Settings > Privacy & Security > Screen Recording > turn on your terminal app\n"
    "  (Terminal, iTerm, or Visual Studio Code if you run it from VS Code), then quit and reopen that app.\n"
    "Or work from a saved screenshot with --image shot.png."
)


def looks_blank(frame):
    """A capture with almost no variation is a blocked capture, not a real screen."""
    small = frame[::8, ::8]
    return float(small.std()) < 3.0


def pick_window():
    if gw is not None:
        titles = [t for t in gw.getAllTitles() if t.strip()]
    elif MAC_CAPTURE:
        titles = [t for _, t in mac_windows() if t.strip()]
    else:
        print("Window listing isn't available here; using the primary monitor.")
        if sys.platform == "darwin":
            print("  For window capture on macOS: pip install pyobjc-framework-Quartz")
        return None
    print("\nWindows:")
    for i, t in enumerate(titles):
        print(f"  [{i}] {t}")
    while True:
        choice = input("Spectator window number (or part of its title): ").strip()
        if choice.isdigit() and int(choice) < len(titles):
            return titles[int(choice)]
        matches = [t for t in titles if choice.lower() in t.lower()]
        if len(matches) == 1:
            return matches[0]
        print("Pick exactly one window." if matches else "No match.")


# ============================================================
# Config
# ============================================================

def load_config():
    if not os.path.exists(CONFIG_PATH):
        return {}
    with open(CONFIG_PATH) as f:
        return json.load(f)


def save_config(cfg):
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"Saved {CONFIG_PATH}")


def scaled_regions(cfg, frame):
    """Regions in this frame's pixels (scaled if the window size changed since calibration)."""
    fw, fh = cfg.get("frame_size", [frame.shape[1], frame.shape[0]])
    sx, sy = frame.shape[1] / fw, frame.shape[0] / fh
    out = {}
    for name, r in cfg.get("regions", {}).items():
        x, y, w, h = r["box"]
        out[name] = {**r, "box": (round(x * sx), round(y * sy), max(1, round(w * sx)), max(1, round(h * sy)))}
    return out


def crop(frame, box):
    x, y, w, h = box
    return frame[max(0, y):y + h, max(0, x):x + w]


# ============================================================
# Image processing
# ============================================================

def channel(crop_bgr, mode):
    """'min' isolates white text on a coloured background; 'max' and 'gray' suit coloured text."""
    if mode == "min":
        return crop_bgr.min(axis=2)
    if mode == "max":
        return crop_bgr.max(axis=2)
    return cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)


def separation(gray):
    """How cleanly Otsu splits this image into two tones (0..1, higher is cleaner)."""
    hist = np.bincount(gray.ravel(), minlength=256).astype(np.float64)
    total = hist.sum()
    if total == 0 or gray.std() < 1:
        return 0.0
    p = hist / total
    levels = np.arange(256)
    w0 = np.cumsum(p)
    mu = np.cumsum(p * levels)
    mu_t = mu[-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        between = (mu_t * w0 - mu) ** 2 / (w0 * (1 - w0))
    return float(np.nanmax(between) / gray.var())


def best_channel(crop_bgr):
    """Prefer 'min' (white text): it ignores coloured background such as a lit turret,
    which 'max' and 'gray' pick up as bright. Use another only if 'min' clearly fails."""
    scores = {m: separation(channel(crop_bgr, m)) for m in ("min", "max", "gray")}
    best = max(scores, key=scores.get)
    return "min" if scores["min"] >= 0.8 * scores[best] else best


def binarize(crop_bgr, mode="min"):
    g = channel(crop_bgr, mode)
    g = cv2.resize(g, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if cv2.countNonZero(bw) > bw.size / 2:  # text is the minority of pixels
        bw = cv2.bitwise_not(bw)
    return bw


def segment(bw):
    """Split a binarised number into characters, left to right.
    Returns a list of ("glyph", image, box) or ("dot", None, box)."""
    n, _, stats, _ = cv2.connectedComponentsWithStats(bw, connectivity=8)
    height = bw.shape[0]
    # The HUD bar is see-through, so map details (turrets, walls) show up as extra shapes.
    # Digits sit inside the box with a gap above and below; background shapes run into the
    # top or bottom edge, so those are dropped. Left/right edges are kept: gold can grow
    # sideways up to the box edge.
    comps = [tuple(stats[i][:4]) for i in range(1, n)
             if stats[i][cv2.CC_STAT_AREA] >= MIN_COMPONENT_AREA
             and stats[i][cv2.CC_STAT_TOP] > 0
             and stats[i][cv2.CC_STAT_TOP] + stats[i][cv2.CC_STAT_HEIGHT] < height]
    if not comps:
        return []
    tallest = max(h for _, _, _, h in comps)
    baseline = max(y + h for _, y, _, h in comps if h >= 0.6 * tallest)
    out = []
    for x, y, w, h in sorted(comps):
        if h >= 0.6 * tallest:
            for sx, sw in split_touching(bw[y:y + h, x:x + w], tallest):
                piece = bw[y:y + h, x + sx:x + sx + sw]
                rows = np.where(piece.any(axis=1))[0]  # trim to the piece's own height
                if len(rows):
                    py, ph = y + rows[0], rows[-1] - rows[0] + 1
                    out.append(("glyph", bw[py:py + ph, x + sx:x + sx + sw], (x + sx, py, sw, ph)))
        elif h <= 0.35 * tallest and w <= 0.5 * tallest and abs(y + h - baseline) <= 0.2 * tallest:
            out.append(("dot", None, (x, y, w, h)))
        # anything else (specks, icon edges) is ignored
    return out


def split_touching(blob, char_h):
    """Characters that touch come out as one wide blob. Split it into as many pieces as
    its width suggests, cutting at the thinnest column near each expected boundary.
    Returns [(x, width)] within the blob."""
    w = blob.shape[1]
    count = int(round(w / (CHAR_WIDTH_RATIO * char_h)))
    if w <= MAX_SINGLE_RATIO * char_h or count < 2:
        return [(0, w)]
    ink = (blob > 0).sum(axis=0)
    cuts = [0]
    for i in range(1, count):
        guess = round(i * w / count)
        lo, hi = max(cuts[-1] + 1, guess - w // (count * 4)), min(w - 1, guess + w // (count * 4) + 1)
        cuts.append(lo + int(np.argmin(ink[lo:hi])) if hi > lo else guess)
    cuts.append(w)
    return [(a, b - a) for a, b in zip(cuts, cuts[1:]) if b - a > 1]


def normalize(glyph):
    """Scale to a fixed height keeping the aspect ratio, centred on a fixed canvas."""
    h, w = glyph.shape
    nw = max(1, min(GLYPH_W, round(w * GLYPH_H / h)))
    resized = cv2.resize(glyph, (nw, GLYPH_H), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((GLYPH_H, GLYPH_W), np.uint8)
    x0 = (GLYPH_W - nw) // 2
    canvas[:, x0:x0 + nw] = resized
    return canvas


def load_templates():
    templates = {}
    for path in glob.glob(os.path.join(TEMPLATE_DIR, "*.png")):
        label = os.path.basename(path).split("_")[0]
        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if label in GLYPH_LABELS and img is not None and img.shape == (GLYPH_H, GLYPH_W):
            templates.setdefault(label, []).append(img.astype(np.float32))
    return templates


def classify(norm, templates):
    """(best label, its score, lead over the next-best different label) for one character.
    Each label scores as its best-matching template."""
    sample = norm.astype(np.float32)
    per_label = {}
    for label, imgs in templates.items():
        for t in imgs:
            score = float(cv2.matchTemplate(sample, t, cv2.TM_CCOEFF_NORMED)[0][0])
            if np.isnan(score):
                score = 0.0
            per_label[label] = max(per_label.get(label, -1.0), score)
    if not per_label:
        return None, -1.0, 0.0
    ranked = sorted(per_label.items(), key=lambda kv: -kv[1])
    lead = ranked[0][1] - ranked[1][1] if len(ranked) > 1 else 1.0
    return ranked[0][0], ranked[0][1], lead


def read_text(crop_bgr, mode, templates):
    """Returns (text, lowest character score), or (None, reason)."""
    parts = segment(binarize(crop_bgr, mode))
    if not any(kind == "glyph" for kind, _, _ in parts):
        return None, "no characters"
    text, worst = "", 1.0
    for kind, img, _ in parts:
        if kind == "dot":
            text += "."
            continue
        label, score, lead = classify(normalize(img), templates)
        if label is None or score < MATCH_THRESHOLD:
            return None, f"unsure ({score:.2f})"
        if lead < MIN_MARGIN:
            return None, f"ambiguous ({label}?)"  # e.g. a blurred 3 that also looks like an 8
        text += label
        worst = min(worst, score)
    return text, worst


def parse_value(text, stat):
    if text is None:
        return None
    if stat != "gold":
        return int(text) if text.isdigit() else None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)(k?)", text)
    if not m:
        return None
    return int(round(float(m.group(1)) * (1000 if m.group(2) else 1)))


# ============================================================
# Filtering
# ============================================================

class Tracker:
    """Turns noisy per-frame reads into confirmed values.

    A value is accepted once it has been read AGREE_READS times in a row. A drop, or a
    rise bigger than the stat allows in one step, needs UNUSUAL_READS in a row, so a kill
    banner or camera flash can't push a wrong number to the stream, but a new game
    (everything back to 0) still gets through after a few seconds.
    """

    def __init__(self, stat):
        self.lo, self.hi, self.step = LIMITS[stat]
        self.value = None
        self.candidate = None
        self.streak = 0

    def reset(self):
        self.value, self.candidate, self.streak = None, None, 0

    def feed(self, v):
        if v is None or not (self.lo <= v <= self.hi):
            return False
        if v == self.candidate:
            self.streak += 1
        else:
            self.candidate, self.streak = v, 1
        if v == self.value:
            return False
        normal = self.value is None or 0 < v - self.value <= self.step
        if self.streak >= (AGREE_READS if normal else UNUSUAL_READS):
            self.value = v
            return True
        return False


# ============================================================
# WebSocket
# ============================================================

class Relay:
    """Keeps a connection to the room open in the background and reconnects if it drops.
    Incoming messages are read and discarded: the relay server sends us everything the
    controller sends, and leaving it unread would back up the server."""

    def __init__(self, url):
        import websocket  # websocket-client

        self.url = url
        self.app = None
        self.connected = False
        self.on_connect = None
        self._websocket = websocket
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        while True:
            self.app = self._websocket.WebSocketApp(
                self.url,
                on_open=self._opened,
                on_close=self._closed,
                on_error=lambda _ws, e: print(f"WebSocket error: {e}"),
                on_message=lambda _ws, _msg: None,
            )
            self.app.run_forever(ping_interval=30, ping_timeout=10)
            self.connected = False
            time.sleep(3)

    def _opened(self, _ws):
        self.connected = True
        print(f"Connected to {self.url}")
        if self.on_connect:
            self.on_connect()

    def _closed(self, *_):
        if self.connected:
            print("WebSocket closed, reconnecting...")
        self.connected = False

    def send(self, payload):
        if not self.connected:
            return False
        try:
            self.app.send(json.dumps(payload))
            return True
        except Exception as e:
            print(f"Send failed: {e}")
            return False


class DryRelay:
    on_connect = None

    def send(self, payload):
        print("SEND", json.dumps(payload))
        return True


def room_url(room):
    base = os.environ.get("WS_URL", "ws://localhost:8080/ws").rstrip("/")
    if not room:
        room = input("Room code from the controller URL (Enter for a random one): ").strip()
    if not room:
        room = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
        print(f"Generated room code {room}. Add ?room={room} to the controller and overlay URLs.")
    return f"{base}/{room}"


# ============================================================
# Mode: calibrate
# ============================================================

def with_banner(img, prompt):
    """img with an instruction banner added ABOVE it (never drawn over it: the stats bar
    sits at the very top of the game). Returns (canvas, banner height)."""
    # big frames (Retina captures) are shown scaled down, so scale the text up to stay readable
    k = max(1.0, img.shape[1] / 1600)
    banner_h = int(40 * k)
    banner = np.zeros((banner_h, img.shape[1], 3), np.uint8)
    cv2.putText(banner, prompt, (int(8 * k), int(27 * k)), cv2.FONT_HERSHEY_SIMPLEX,
                0.65 * k, (0, 255, 255), max(1, int(2 * k)))
    return np.vstack([banner, img]), banner_h


def fit_window(win, w, h, max_w=1600, max_h=900):
    """Size a WINDOW_NORMAL window to fit the screen, keeping the image's proportions.
    The image itself keeps its full resolution; only the view is scaled."""
    k = min(1.0, max_w / w, max_h / h)
    cv2.resizeWindow(win, int(w * k), int(h * k))


def select_box(win, img, prompt):
    """Drag a box on img; returns (x, y, w, h) in img's pixels, or None if skipped
    (Enter/Space without a box)."""
    shown, offset = with_banner(img, prompt)
    x, y, w, h = cv2.selectROI(win, shown, showCrosshair=False, fromCenter=False)
    if w <= 0 or h <= 0:
        return None
    top, bottom = max(0, y - offset), min(img.shape[0], y + h - offset)  # drop any part dragged over the banner
    return (int(x), int(top), int(w), int(bottom - top)) if bottom > top else None


def cmd_calibrate(args):
    cfg = load_config()
    window = args.window or (None if args.image else pick_window())
    source = Source(args.image, window)
    frame = source.grab()
    if frame is None:
        sys.exit(f"Could not capture the {source.describe()}.")
    if looks_blank(frame):
        sys.exit(BLANK_HELP)
    print(f"\nCapturing the {source.describe()} ({frame.shape[1]}x{frame.shape[0]}).")
    print("Make sure a match is on screen with the top bar visible.\n")

    win = "Calibrate"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    fit_window(win, frame.shape[1], frame.shape[0] + with_banner(frame, "")[1])

    print("Step 1: drag a box around the whole top stats bar, then press Enter.")
    area = select_box(win, frame, "Drag around the whole top stats bar, then Enter")
    if not area:
        sys.exit("Cancelled.")
    ax, ay, aw, ah = area
    zoom = max(1, min(6, 1500 // aw))
    zoomed = cv2.resize(crop(frame, area), None, fx=zoom, fy=zoom, interpolation=cv2.INTER_NEAREST)
    fit_window(win, zoomed.shape[1], zoomed.shape[0] + with_banner(zoomed, "")[1])

    print("Step 2: for each number, drag a box around the digits only (not the icon), then Enter.")
    print("        Leave room for the number to grow (e.g. gold going from 9.9k to 99.9k).")
    print("        Leave a small gap above and below the digits: shapes touching the top or bottom edge are ignored.")
    print("        If your HUD has no counter for a stat, press Enter without dragging to skip it.")
    print("        Press Enter without dragging to keep a previous box.\n")
    old = scaled_regions(cfg, frame) if cfg.get("regions") else {}
    regions = {}
    for name in REGION_NAMES:
        canvas = zoomed.copy()
        for other, r in {**old, **regions}.items():
            x, y, w, h = r["box"]
            p1 = ((x - ax) * zoom, (y - ay) * zoom)
            p2 = ((x - ax + w) * zoom, (y - ay + h) * zoom)
            color = (0, 255, 0) if other in regions else (128, 128, 128)
            cv2.rectangle(canvas, p1, p2, color, 1)
        box = select_box(win, canvas, f"{name}: drag around the digits, Enter (Enter alone keeps the old box)")
        if box:
            bx, by, bw, bh = box
            box = (ax + bx // zoom, ay + by // zoom, max(1, bw // zoom), max(1, bh // zoom))
        elif name in old:
            box = old[name]["box"]
        else:
            print(f"  {name}: skipped")
            continue
        regions[name] = {"box": list(box), "channel": best_channel(crop(frame, box))}
        print(f"  {name}: {box}  (channel: {regions[name]['channel']})")
    cv2.destroyWindow(win)

    cfg.update({
        "window": window,
        "frame_size": [frame.shape[1], frame.shape[0]],
        "regions": regions,
    })
    save_config(cfg)
    show_preview(frame, regions)
    print("\nNext: python ingame_stats_bot.py templates" + (f" --image {args.image}" if args.image else ""))


def show_preview(frame, regions):
    """What the reader sees for each box: white characters on black."""
    rows = []
    for name, r in regions.items():
        bw = binarize(crop(frame, r["box"]), r["channel"])
        bw = cv2.resize(bw, (min(bw.shape[1], 360), bw.shape[0] * min(bw.shape[1], 360) // bw.shape[1] or 1))
        row = np.zeros((max(bw.shape[0], 30), 520), np.uint8)
        cv2.putText(row, name, (4, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 255, 1)
        row[:bw.shape[0], 150:150 + bw.shape[1]] = bw
        rows.append(row)
    if not rows:
        return
    win = "Preview: each number should be clean white characters (any key to close)"
    cv2.imshow(win, np.vstack(rows))
    cv2.waitKey(0)
    cv2.destroyWindow(win)


# ============================================================
# Mode: templates
# ============================================================

def cmd_templates(args):
    cfg = load_config()
    if not cfg.get("regions"):
        sys.exit("Run calibrate first.")
    os.makedirs(TEMPLATE_DIR, exist_ok=True)
    source = Source(args.image, args.window or cfg.get("window"))
    win = "Label characters"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)

    print("\nFor each highlighted character press the key it shows: 0-9 or k.")
    print("Space skips it, Q stops. Characters that already match a saved template are skipped.")
    print("Run this on a few different moments of a match until every character 0-9 and k is covered.\n")

    while True:
        frame = source.grab()
        if frame is None:
            print("Capture failed, retrying...")
            time.sleep(1)
            continue
        if looks_blank(frame):
            sys.exit(BLANK_HELP)
        templates = load_templates()
        quit_now = False
        for name, r in scaled_regions(cfg, frame).items():
            c = crop(frame, r["box"])
            bw = binarize(c, r["channel"])
            for kind, glyph, (gx, gy, gw_, gh) in segment(bw):
                if kind != "glyph":
                    continue
                norm = normalize(glyph)
                label, score, _ = classify(norm, templates)
                if label is not None and score >= DUPLICATE_SCORE and not args.all:
                    continue
                view = cv2.resize(c, (c.shape[1] * SCALE, c.shape[0] * SCALE), interpolation=cv2.INTER_NEAREST)
                cv2.rectangle(view, (gx, gy), (gx + gw_, gy + gh), (0, 255, 255), 1)
                big = cv2.cvtColor(cv2.resize(norm, (GLYPH_W * 4, GLYPH_H * 4), interpolation=cv2.INTER_NEAREST), cv2.COLOR_GRAY2BGR)
                h = max(view.shape[0], big.shape[0]) + 30
                panel = np.zeros((h, view.shape[1] + big.shape[1] + 20, 3), np.uint8)
                panel[30:30 + view.shape[0], :view.shape[1]] = view[: h - 30]
                panel[30:30 + big.shape[0], view.shape[1] + 20:] = big[: h - 30]
                guess = f"  guess {label} {score:.2f}" if label else ""
                cv2.putText(panel, f"{name}: which character?{guess}", (4, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)
                cv2.imshow(win, panel)
                key = cv2.waitKey(0) & 0xFF
                ch = chr(key).lower() if key < 128 else ""
                if ch == "q" or key == 27:
                    quit_now = True
                    break
                if ch in GLYPH_LABELS:
                    path = os.path.join(TEMPLATE_DIR, f"{ch}_{int(time.time() * 1000)}.png")
                    cv2.imwrite(path, norm)
                    templates.setdefault(ch, []).append(norm.astype(np.float32))
                    print(f"  saved {ch}")
            if quit_now:
                break

        have = load_templates()
        missing = [l for l in GLYPH_LABELS if l not in have]
        print("Templates: " + ", ".join(f"{l}x{len(have[l])}" for l in GLYPH_LABELS if l in have))
        if missing:
            print(f"Still missing: {' '.join(missing)} (k only matters if gold shows as e.g. 12.3k)")
        if quit_now or args.image:
            break
        if input("Enter to grab another frame, q to finish: ").strip().lower() == "q":
            break
    cv2.destroyAllWindows()


# ============================================================
# Mode: run
# ============================================================

def snapshot(trackers):
    stats = {side: {} for side in SIDES}
    for name, t in trackers.items():
        if t.value is not None:
            side, stat = name.split("-")
            stats[side][stat] = t.value
    return {"type": "ingame-stats", "stats": stats}


def draw_debug(frame, regions, reads, trackers):
    xs = [r["box"][0] for r in regions.values()] + [r["box"][0] + r["box"][2] for r in regions.values()]
    ys = [r["box"][1] for r in regions.values()] + [r["box"][1] + r["box"][3] for r in regions.values()]
    pad = 40
    x0, y0 = max(0, min(xs) - pad), max(0, min(ys) - pad)
    x1, y1 = min(frame.shape[1], max(xs) + pad), min(frame.shape[0], max(ys) + pad * 2)
    zoom = max(1, min(3, 1600 // max(1, x1 - x0)))
    view = cv2.resize(frame[y0:y1, x0:x1], None, fx=zoom, fy=zoom, interpolation=cv2.INTER_NEAREST)
    for name, r in regions.items():
        x, y, w, h = r["box"]
        p1 = ((x - x0) * zoom, (y - y0) * zoom)
        p2 = ((x - x0 + w) * zoom, (y - y0 + h) * zoom)
        text, info = reads.get(name, (None, ""))
        ok = text is not None
        cv2.rectangle(view, p1, p2, (0, 255, 0) if ok else (0, 0, 255), 1)
        label = f"{text if ok else '?'} -> {trackers[name].value}" if ok else f"{info} -> {trackers[name].value}"
        cv2.putText(view, label, (p1[0], p2[1] + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
    cv2.putText(view, "Q quit | R reset all values (new game)", (6, view.shape[0] - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    return view


def cmd_run(args):
    cfg = load_config()
    if not cfg.get("regions"):
        sys.exit("Run calibrate first.")
    templates = load_templates()
    missing = [l for l in "0123456789" if l not in templates]
    if missing:
        sys.exit(f"No templates for: {' '.join(missing)}. Run the templates mode first.")

    source = Source(args.image, args.window or cfg.get("window"))
    relay = DryRelay() if args.dry_run else Relay(room_url(args.room))
    trackers = {name: Tracker(name.split("-")[1]) for name in cfg["regions"]}
    last_sent = 0.0
    resend = threading.Event()
    relay.on_connect = resend.set  # an overlay may have reloaded while we were offline

    print(f"\nReading the {source.describe()} at {args.fps} fps. Ctrl+C to stop.")
    interval = 1.0 / args.fps
    warned_size = False
    frames_read = 0
    try:
        while True:
            started = time.time()
            frame = source.grab()
            if frame is None:
                print("Capture failed (window closed or minimised?), retrying...")
                time.sleep(1)
                continue
            if frames_read == 0 and looks_blank(frame):
                sys.exit(BLANK_HELP)
            if not warned_size and list(frame.shape[1::-1]) != cfg.get("frame_size"):
                print(f"Window is {frame.shape[1]}x{frame.shape[0]} but was calibrated at "
                      f"{cfg['frame_size'][0]}x{cfg['frame_size'][1]}; boxes are being scaled. Recalibrate if reads fail.")
                warned_size = True

            regions = scaled_regions(cfg, frame)
            reads, changed = {}, False
            for name, r in regions.items():
                text, info = read_text(crop(frame, r["box"]), r["channel"], templates)
                reads[name] = (text, info if text is None else "")
                value = parse_value(text, name.split("-")[1])
                if trackers[name].feed(value):
                    changed = True
                    print(f"{time.strftime('%H:%M:%S')}  {name} = {trackers[name].value}")

            now = time.time()
            if changed or resend.is_set() or now - last_sent >= HEARTBEAT_SECONDS:
                msg = snapshot(trackers)
                if (msg["stats"]["blue"] or msg["stats"]["red"]) and relay.send(msg):
                    last_sent = now
                    resend.clear()

            if args.debug:
                cv2.imshow("In-game stats reader", draw_debug(frame, regions, reads, trackers))
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break
                if key == ord("r"):
                    for t in trackers.values():
                        t.reset()
                    print("All values reset.")
            if args.image and not args.debug:
                # a still image never changes: read it enough times to confirm, print, stop
                frames_read += 1
                if frames_read >= AGREE_READS:
                    for name, (text, info) in reads.items():
                        print(f"  {name:13} {text if text is not None else '-- ' + info}")
                    print(json.dumps(snapshot(trackers), indent=2))
                    break
            time.sleep(max(0.0, interval - (time.time() - started)))
    except KeyboardInterrupt:
        pass
    cv2.destroyAllWindows()


# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Read MLBB spectator stats and send them to gameDisplay.html")
    sub = parser.add_subparsers(dest="mode", required=True)

    def common(p):
        p.add_argument("--image", help="use a saved screenshot instead of a live window")
        p.add_argument("--window", help="spectator window title (default: the one saved by calibrate)")

    common(sub.add_parser("calibrate", help="mark the 8 number boxes"))
    p = sub.add_parser("templates", help="label example characters")
    common(p)
    p.add_argument("--all", action="store_true", help="also ask about characters that already match")
    p = sub.add_parser("run", help="read and send stats")
    common(p)
    p.add_argument("--room", help="room code from the controller URL")
    p.add_argument("--fps", type=float, default=DEFAULT_FPS, help=f"reads per second (default {DEFAULT_FPS})")
    p.add_argument("--debug", action="store_true", help="show a window with every box and its reading")
    p.add_argument("--dry-run", action="store_true", help="print messages instead of sending them")

    args = parser.parse_args()
    {"calibrate": cmd_calibrate, "templates": cmd_templates, "run": cmd_run}[args.mode](args)


if __name__ == "__main__":
    main()
