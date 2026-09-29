# Architecture

N-W-I-S sits beside the rig's live monitoring system.
That system shows the rig's live data.
N-W-I-S brings the offset wells' history to the same moment, tied to formations rather than depths.

## The pipeline

```
packages/synth          seeded generator: field, tops, drilling histories, daily reports, replay
      │  data/demo/field.json, data/demo/reports.json
      ▼
packages/synth/ddr      renders every daily report to PDF; one report in five is scanned to an image
      │  data/demo/ddr/<well>/<report>.pdf
      ▼
packages/extract        pdfplumber on text pages, Tesseract on scanned ones; incidents to events
      │  data/demo/extracted/events.json, documents.json, stats.json
      ▼
apps/api (FastAPI)      wells, events, replay, search, document pages and OCR words, review queue, briefing export
apps/web (Next.js)      home, arrival, correlation section, drawer, map, search, comparison, briefing, ingestion, research
      ▲
packages/correlate      formation tie, re-tie, projection by formation, ETA, bands,
                        recommendation, analogue ranking, briefing composition

data/volve/fetch.py     Equinor's Volve daily reports through the same hazard rules
      │  data/volve/metrics.json, checked against data/volve/checked-sample.json
      ▼
apps/web ingestion      the real-report card
```

Every alert on screen comes from a parsed report page.
The generator's own events are ground truth for scoring the parser, never shown as alerts.

The hazard rules in `packages/extract/wells_extract/hazards.py` are shared.
The PDF parser uses them when an incident's type label is unreadable, and the Volve reader uses them on every activity comment.
Each rule names the drilling context it needs and drops clauses that negate or only check for the hazard, so "no losses observed" and "performed kick drill" never count.

## Where each part runs

| Part | Language | Runs where |
|---|---|---|
| `packages/synth` | TypeScript | `pnpm synth`, once, deterministic from seed 26121 |
| `packages/synth/ddr` | Python, reportlab, PDFium | `uv run python -m wells_ddr.render` |
| `packages/extract` | Python, pdfplumber, Tesseract | `uv run python -m wells_extract.run` |
| `data/volve/fetch.py` | Python, pyarrow | `uv run python data/volve/fetch.py` |
| `packages/correlate` | TypeScript | in the browser, so the re-tie animates at 60 fps, and on the web server |
| `apps/api` | Python, FastAPI | port 8121 |
| `apps/web` | Next.js App Router, Tailwind, shadcn/ui | port 3000 |

The correlation logic runs in the browser because the re-tie is an animation.
The section re-computes projections and time to hazard on every frame of the slide, so the ETA counts down as the pins move.

## Routes

`/` is the home screen, one field to open a well.
Opening KN-125 goes to `/section?arrive=1`, which plays the arrival over the console and then hands over to it.
The console routes, `/section`, `/map`, `/search`, `/compare`, `/briefing`, `/ingestion`, `/research` and `/about`, share one layout with the top bar, the nav rail and the report drawer.

## The arrival

`apps/web/src/lib/arrival.ts` is the whole arrival as pure functions of one number, seconds since the well was opened.
The camera path, the report reading order, the tilt of the ground and the moment each chip falls all come from that number, and `lib/arrival.test.ts` checks the joins.

The fly-in starts high over the Ganga plain looking east along the Himalaya, so the ocean never enters the frame, and uses Google's `Map3DElement` in satellite mode with a fixed 35° field of view.
After it, the camera looks straight down, so a field point in metres lands on screen by plain scaling and rotation, and the wells, the ring and the chips are drawn as SVG over the map.
The cut is CSS: the ground plane rotates about the A to A' line and the section face rotates about the same line from below, with matching perspective, so the two meet along the cut.
The face is the real correlation panel, drawn at the console panel's size, so when it flattens it lands exactly on the section underneath and the arrival removes itself.
The fictional field is placed on real terrain by converting its metre offsets to latitude and longitude around `FIELD.anchor` in `packages/synth/src/scenario.ts`.

Without a Google key the arrival starts at the field on a plain grid.

The Map screen uses the same anchor on Google's flat satellite map, and projects every well, the ring, the section line and the fault from field metres on each pan and zoom.
Its Structure toggle shows the drawn Barail contour map, which is also what it shows when there is no key.

## Live state

The replay is a 10-second telemetry stream for KN-125 with the mud-logger's messages at known ticks.
A provider in the console layout holds it, so it keeps ticking while the engineer is on the map or reading a report.
`?tick=<n>` opens at a tick and `?play=1` starts it.

## Review before alerts

An event under 0.85 confidence cannot raise an alert until a person confirms it on the ingestion screen.
Decisions live in the API.
The web server reads them on every request and leaves unconfirmed events off the section.

## Recording

`recording/film.ts` plays `recording/storyboard.ts` and runs on two clocks.
From the home screen to the end of the arrival, the page's clock runs in real time because the 3D map renders on it.
The film drives the arrival through `window.__arrival.at(t)` and waits for the map to report a steady state before each frame, so no frame shows half-loaded tiles.
From the console on, it pauses Playwright's fake clock and steps every frame by hand.
The replay, the re-tie and every CSS animation advance exactly 1/30 s per frame, so the video is the same on any machine.

`?film=1` turns on the recording layout for the tab's session: secondary labels hide and the rail grows.
It lays the app out at 1600 by 900 and renders it at a 1.2 device scale, so each frame is exactly 1920 by 1080 with text drawn at full resolution.
Edit zooms are CSS transforms on the page, so zoomed text is drawn sharp rather than upscaled.
The cursor, the rings, the lower third and the end card are drawn by the script, outside the app.
Frames go straight to the ffmpeg that ships inside the Python environment and come out as H.264.
