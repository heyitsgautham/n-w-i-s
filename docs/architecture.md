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
apps/api (FastAPI)      wells, events, replay, search, document pages, review queue, briefing export
apps/web (Next.js)      correlation section, drawer, map, search, comparison, briefing, ingestion
      ▲
packages/correlate      formation tie, re-tie, projection by formation, ETA, bands,
                        recommendation, analogue ranking, briefing composition
```

Every alert on screen comes from a parsed report page.
The generator's own events are ground truth for scoring the parser, never shown as alerts.

## Where each part runs

| Part | Language | Runs where |
|---|---|---|
| `packages/synth` | TypeScript | `pnpm synth`, once, deterministic from seed 26121 |
| `packages/synth/ddr` | Python, reportlab, PDFium | `uv run python -m wells_ddr.render` |
| `packages/extract` | Python, pdfplumber, Tesseract | `uv run python -m wells_extract.run` |
| `packages/correlate` | TypeScript | in the browser, so the re-tie animates at 60 fps, and on the web server |
| `apps/api` | Python, FastAPI | port 8121 |
| `apps/web` | Next.js App Router, Tailwind, shadcn/ui | port 3000 |

The correlation logic runs in the browser because the re-tie is an animation.
The section re-computes projections and time to hazard on every frame of the slide, so the ETA counts down as the pins move.

## Live state

The replay is a 10-second telemetry stream for KN-125 with the mud-logger's messages at known ticks.
A provider in the root layout holds it, so it keeps ticking while the engineer is on the map or reading a report.
`?tick=<n>` opens at a tick and `?play=1` starts it.

## Review before alerts

An event under 0.85 confidence cannot raise an alert until a person confirms it on the ingestion screen.
Decisions live in the API.
The web server reads them on every request and leaves unconfirmed events off the section.

## Recording

`recording/film.ts` plays `recording/storyboard.ts` on Playwright's fake clock and steps every frame by hand.
The replay, the re-tie and every CSS transition advance exactly 1/30 s per frame, so the video is the same on any machine.
It records a 1600 by 900 viewport at 2x and exports 1920 by 1080, so the rail text survives compression.
Edit zooms are CSS transforms on the page, so zoomed text is drawn sharp rather than upscaled.
The cursor, the rings, the lower third and the end card are drawn by the script, outside the app.
Frames go straight to the ffmpeg that ships inside the Python environment and come out as H.264.
