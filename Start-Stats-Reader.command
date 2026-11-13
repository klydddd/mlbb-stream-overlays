#!/bin/bash
# ------------------------------------------------------------------
#  Double-click this file in Finder to run the in-game stats reader
#  (backend/ingame_stats_bot.py) on a Mac. The first run installs
#  everything it needs into backend/.stats-venv-mac (takes a few minutes).
#  Mac version of Start-Stats-Reader.bat.
# ------------------------------------------------------------------

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
VENV="$BACKEND/.stats-venv-mac"
VPY="$VENV/bin/python"
# Bump this when the package list below changes, so old installs update themselves.
SETUP_VERSION=1
PACKAGES=(opencv-python numpy mss pyobjc-framework-Quartz websocket-client fastapi "uvicorn[standard]")
export PYTHONUTF8=1
SERVER_PID=""
SERVER_LOG="$VENV/server.log"

printf '\033]0;MLBB Stats Reader\007'   # window title

pause() { echo; read -r -p "  Press Enter to continue..." _; }

fail() {
    echo
    read -r -p "  Press Enter to close..." _
    exit 1
}

# Stop the overlay server this window started when the window closes.
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT
trap 'exit 0' HUP INT TERM

if [ ! -f "$BACKEND/ingame_stats_bot.py" ]; then
    echo
    echo "  This file must stay in the main project folder, next to the \"backend\" folder."
    echo "  Move it back there and try again."
    fail
fi

# ================= helpers =================

find_python() {
    # Prefer a real python.org / Homebrew install. Plain /usr/bin/python3 comes last: without
    # the Xcode command line tools it only pops up an installer, so it is checked carefully.
    PY=""
    for cand in python3.12 python3.13 python3.11 python3.10 \
                /opt/homebrew/bin/python3 /usr/local/bin/python3 \
                /Library/Frameworks/Python.framework/Versions/Current/bin/python3; do
        if command -v "$cand" >/dev/null 2>&1 &&
           "$cand" -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >/dev/null 2>&1; then
            PY="$cand"; return 0
        fi
    done
    if xcode-select -p >/dev/null 2>&1 &&
       /usr/bin/python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" >/dev/null 2>&1; then
        PY=/usr/bin/python3; return 0
    fi
    return 1
}

no_python() {
    echo "  Python is not installed on this Mac, and the stats reader needs it."
    echo
    if command -v brew >/dev/null 2>&1; then
        read -r -p "  Install Python now? Type Y and press Enter: " ANSWER
        if [ "$ANSWER" = "Y" ] || [ "$ANSWER" = "y" ]; then
            brew install python@3.12
            echo
            echo "  When the install has finished, CLOSE this window and double-click"
            echo "  Start-Stats-Reader.command again to continue the setup."
            fail
        fi
    fi
    echo "  Install Python 3.12 from https://www.python.org/downloads/"
    echo "  Then double-click Start-Stats-Reader.command again."
    fail
}

setup_failed() {
    echo
    echo "  Setup failed. Check your internet connection and try again."
    echo "  If it keeps failing, send a photo of this window to whoever set up the stream."
    fail
}

server_up() {
    curl -fsS -m 2 http://localhost:8080/api/health >/dev/null 2>&1
}

ensure_server() {
    # The overlays talk through the local server on port 8080. Start it if it is not running.
    # (Skipped when WS_URL points the reader at a server somewhere else.)
    [ -n "$WS_URL" ] && return 0
    if server_up; then
        echo "  Overlay server is running."
        return 0
    fi
    echo "  Starting the overlay server. It stops when you close this window."
    (cd "$BACKEND/server" && exec "$VPY" -m uvicorn server:app --port 8080 --host 0.0.0.0) >"$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
    for _ in $(seq 1 15); do
        sleep 1
        if server_up; then
            echo "  Overlay server is running."
            return 0
        fi
    done
    echo "  The overlay server did not start. Its messages are in:"
    echo "  $SERVER_LOG"
    return 1
}

# ================= one-time setup =================

if [ ! -x "$VPY" ] || [ ! -f "$VENV/setup-$SETUP_VERSION.txt" ]; then
    echo
    echo "  First-time setup: installing what the stats reader needs."
    echo "  This takes a few minutes and needs internet. Please wait..."
    echo
    find_python || no_python
    if [ ! -x "$VPY" ]; then
        "$PY" -m venv "$VENV" || setup_failed
    fi
    "$VPY" -m pip install --upgrade pip --disable-pip-version-check -q
    "$VPY" -m pip install --disable-pip-version-check "${PACKAGES[@]}" || setup_failed
    echo done > "$VENV/setup-$SETUP_VERSION.txt"
    echo
    echo "  Setup finished."
fi

# ================= actions =================

# Ask for the controller address until it has a room code, then print the OBS links.
# Leaves the address in $URL.
ask_url() {
    echo "  Open the controller in your browser and copy its address from the top bar."
    echo "  It looks like: http://localhost:8080/controller.html?room=abc123"
    echo "  Paste it below (Cmd+V), then press Enter."
    echo
    while true; do
        read -r -p "  Controller address: " URL || exit 0
        # prints the links to paste into OBS; fails when the address has no room code
        "$VPY" "$BACKEND/obs_links.py" "$URL" && break
    done
}

# Overlay server + OBS links only: needs no boxes, for PCs that don't read stats.
serve_only() {
    clear
    if [ -n "$WS_URL" ]; then
        echo
        echo "  WS_URL is set, so the overlays use the server at $WS_URL, not one on this Mac."
    elif ! ensure_server; then
        pause
        return
    fi
    echo
    ask_url
    if [ -n "$SERVER_PID" ]; then
        echo "  The overlay server keeps running until you close this window."
    fi
    pause
}

calibrate() {
    clear
    echo
    echo "  SET UP THE BOXES"
    echo "  ----------------"
    echo "  1. Make sure the MLBB spectator view is open with a match on screen."
    echo "  2. Pick that window from the list below by typing its number."
    echo "  3. A picture opens. Drag a box around the whole top stats bar, press Enter."
    echo "  4. Then for each number it names, drag a box around just the digits, press Enter."
    echo "     No such number on screen? Just press Enter to skip it."
    echo "  5. At the end a preview shows the numbers in white. Press any key to close it."
    echo
    echo "  If the picture is all one colour: System Settings > Privacy & Security >"
    echo "  Screen Recording > turn on Terminal, then quit Terminal and start again."
    echo
    if (cd "$BACKEND" && "$VPY" ingame_stats_bot.py calibrate); then
        echo done > "$VENV/calibrated.txt"
        echo
        echo "  Boxes saved. Now choose 2 to start reading stats."
    else
        echo
        echo "  Setup did not finish. Read the message above, then try again."
    fi
    pause
}

run_reader() {
    if [ ! -f "$VENV/calibrated.txt" ]; then
        echo
        echo "  The boxes are not set up on this Mac yet. Choose 1 first."
        pause
        return
    fi
    clear
    ensure_server
    echo
    ask_url
    echo "  Reading stats now. To STOP: press Ctrl+C, or close this window."
    echo
    # Ctrl+C stops only the reader here, not this menu. (A trapped signal resets to the
    # default in the child, so Python still gets Ctrl+C; an ignored one would not.)
    trap ':' INT
    (cd "$BACKEND" && "$VPY" ingame_stats_bot.py run --room "$URL" "$@")
    trap 'exit 0' INT
    echo
    echo "  The stats reader stopped."
    pause
}

# ================= menu =================

while true; do
    clear
    echo
    echo "  ========================================="
    echo "     MLBB STATS READER"
    echo "  ========================================="
    echo
    if [ -f "$VENV/calibrated.txt" ]; then
        echo "   Boxes are set up on this Mac."
    else
        echo "   FIRST TIME? Choose 1 first to mark where the numbers are."
    fi
    echo
    echo "   1  Set up the boxes  - first time, or if the stream layout changed"
    echo "   2  Start reading stats"
    echo "   3  Start reading stats with a preview window - to check it works"
    echo "   4  Start the overlay server and show the OBS links  (no stats reader)"
    echo "   5  Quit"
    echo
    read -r -p "  Type a number and press Enter: " CHOICE || exit 0   # input closed
    case "$CHOICE" in
        1) calibrate ;;
        2) run_reader ;;
        3) run_reader --debug ;;
        4) serve_only ;;
        5) exit 0 ;;
    esac
done
