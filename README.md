# N-W-I-S

Offset-well memory for the well being drilled.

![The section after the mud logger's call: every alert below the Barail top moved up 38 m, and alert 1 is now 10 h 20 m away](docs/hero.png)

Every incident in the offset wells' daily reports is placed on the active well by the rock layer it happened in.
When the mud logger calls a top off the prognosis, the section re-ties, and every alert below it is re-timed at the live rate of penetration.
Each alert opens the report page it came from, read by OCR, with the sentence behind it highlighted.

| Run | Result |
|---|---|
| Parser on the demo pack | 926 daily reports, 190 scanned pages read by Tesseract, 118 of 120 planted incidents found |
| Hazard rules on real reports | 1,759 daily reports from Equinor's Volve field, 379 hazards found, 91 of 100 right when checked by hand |

The field is fictional and the wells are synthetic, drawn on real Google satellite terrain in Upper Assam.
This is a working prototype, not deployed at Oil India.

## Run it

You need Node 22 or later, pnpm 10, [uv](https://docs.astral.sh/uv/) and Tesseract.

```
make demo      # installs, builds the demo pack if missing, starts the API on :8121 and the web app on :3000
```

The flight to the field needs a Google Maps key with the Maps JavaScript and Map Tiles APIs, set as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `apps/web/.env.local`.
Without one, the app opens on the field and every other screen works.

`pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` run the same checks as CI.

## Inside

```
apps/web/            every screen, in Next.js and Tailwind
apps/api/            FastAPI over the demo pack and the parsed reports
packages/correlate/  formation tie, re-tie, time to hazard, recommendation
packages/extract/    report parser: text layer, OCR, incidents, hazard rules, Volve
packages/synth/      seeded field, drilling histories, daily reports rendered to PDF
recording/           the demo video, scripted frame by frame
docs/                architecture, alert logic, data model, synthetic data, prior work
```

[docs/synthetic-data.md](docs/synthetic-data.md) says exactly what is real and what is not.

Team 1, Saveetha Engineering College.
MIT licence.
Formation names follow USGS Bulletin 2208-D.
The Volve reports are Equinor's, under the Equinor Open Data Licence.
