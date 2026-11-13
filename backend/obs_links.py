"""Print the overlay links to paste into OBS browser sources, for one controller URL.

Used by Start-Stats-Reader.bat / Start-Stats-Reader.command:
    python obs_links.py "http://localhost:8080/controller.html?room=abc123"
Exits 1 (with a message) when the URL has no ?room= code.
"""

import re
import sys

# (page, what it is) - every OBS browser source is 1920 x 1080
OVERLAYS = [
    ("display.html", "Draft overlay (moves on to the heroes lineup and the in-game HUD by itself)"),
    ("gameDisplay.html", "In-game HUD on its own (only if it has its own OBS scene)"),
    ("waiting.html", "Waiting / break screen"),
    ("cams.html", "Caster cams screen (cams, sponsors, next match)"),
]


def main():
    url = (sys.argv[1] if len(sys.argv) > 1 else "").strip().strip('"')
    found = re.search(r"[?&]room=([^&#\s]+)", url)
    if not found:
        print("  That address has no ?room= code in it. Copy the whole address from the controller.")
        return 1
    room = found.group(1)
    # everything before controller.html (or the query), e.g. http://localhost:8080/
    base = re.split(r"controller\.html|\?", url, maxsplit=1)[0]
    if not re.match(r"https?://", base):
        base = "http://localhost:8080/"
    if not base.endswith("/"):
        base += "/"

    print()
    print(f"  OBS LINKS  (room {room})")
    print("  ---------")
    print("  In OBS: Sources > + > Browser, paste one link as the URL, set width 1920 and height 1080.")
    print()
    for page, label in OVERLAYS:
        print(f"  {label}:")
        print(f"    {base}{page}?room={room}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
