# Data model

All types live in `packages/correlate/src/types.ts`.
The Python side reads the same JSON.

## Depths

Four depth references, never mixed.

| Name | Meaning |
|---|---|
| `md` | measured depth along hole from the well's own rotary table, metres |
| `tvd` | true vertical depth below the well's own rotary table |
| `tvdss` | true vertical depth below mean sea level |
| display | TVD below the active well's rotary table, the correlation section's shared axis |

Trajectories come from survey stations by minimum curvature.
Every conversion goes through `packages/correlate/src/depth.ts`.
Labels on the section show each well's own MD; positions use display depth.

## Records

| Record | Key fields |
|---|---|
| Formation | id, name, lithology; ten units from Alluvium to Basement |
| Well | id, role, grid x and y, RT elevation, spud date, rig, surveys, tops, beds, hole sections, mud schedule, days-versus-depth curve |
| Formation top | formation, md, status: `log` for offsets, `called` or `prognosed` for the active well |
| Daily report | well, date, report number, depths at 00:00 and 24:00, summary, forecast, operations, incidents, mud, bit, surveys |
| Incident | event id, type, time, depth, mud weight, NPT, description, action, remarks |
| Offset event | id, well, type, title, md, date, mud weight, NPT, loss rate, narrative, action, remarks, lessons, source, confidence |
| Source | report id, page, box on the page in PDF points, OCR flag |
| Telemetry | tick, time, bit depth, lagged sample depth, ROP, 10-minute ROP, WOB, RPM, flow, mud weight |
| Rig message | tick, time, driller or mud logger, text, optional top call |

## Files in data/demo

| File | Written by | Read by |
|---|---|---|
| `field.json` | `pnpm synth` | web, API, renderer, parser scoring |
| `reports.json` | `pnpm synth` | DDR renderer |
| `ddr/<well>/*.pdf` | DDR renderer | parser, API page images |
| `ddr/manifest.json` | DDR renderer | parser |
| `extracted/events.json` | parser | web, API |
| `extracted/documents.json` | parser | API |
| `extracted/stats.json` | parser | ingestion screen |

Tests fail if `field.json` or `reports.json` drift from what the generator produces for the seed.
