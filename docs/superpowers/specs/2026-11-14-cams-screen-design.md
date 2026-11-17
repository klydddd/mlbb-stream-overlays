# Caster cams screen

## Intent
An OBS scene that shows only the caster cameras, with the sponsor strip and the next match.

## Approaches
- **New page `cams.html` (picked):** reuses `js/casterCamsDisplay.js` (same element ids as display.html) and `js/sponsorStrip.js`.
- A mode of display.html: rejected; the draft page is already crowded and is the draft source.

## Design
- 1920x1080 transparent stage: sponsor strip (hidden without logos), 1/2 cams sized to the space left, NEXT MATCH card.
- Match card (updated): rotates NEXT MATCH (10 s) -> PREVIOUS MATCH (5 s) -> every filled row in order (5 s each) -> loop. Played rows show the score. None: card hidden. No cams: card centered.
- Late-join resend (user asked for it): page sends `waiting-request` + `cams-request` once the socket opens; casterCams.js and sponsors.js answer `cams-request`.
- Link added to `backend/obs_links.py` (printed by the stats reader launchers).
