# Synthetic data, and what is real

This is a target product and a working prototype.
It runs on synthetic data, and says so on every screen and every report page.

## What is synthetic

The Kathal Nala field, KN-125 and its 24 offsets are fictional.
The KN prefix is invented so nobody reads the wells as Oil India data.
Formation names and their order follow the Upper Assam shelf column in USGS Bulletin 2208-D.
Depths, thicknesses, dips and the F1 fault come from a seeded structural model, not from any survey.

The 926 daily drilling reports are generated from simulated drilling histories and rendered to PDF.
Every page carries "SYNTHETIC REPORT ... Not Oil India data" in its footer.
About one report in five is rasterised to a greyscale image, and a third of those are degraded to fax quality, so the OCR path reads real pixels.

## What runs for real

| Part | What it does on this data |
|---|---|
| Parser | reads all 926 PDFs, text layer or Tesseract OCR, and recovers 118 of 120 true events with exact depths |
| Correlation | places events by formation, re-ties on the call, times alerts against the bit |
| Search | reads a plain-English question into filters and ranks parsed events |
| Briefing | writes the offset review from parsed events and exports a PDF |
| Review gate | keeps low-confidence events off the section until confirmed |

## What is not done

The Equinor Volve reports are not parsed yet.
The data set sits behind a licence download on the Databricks Marketplace.
The WITSML parser for it is written and tested on a hand-made fixture, and `data/volve/fetch.py` runs it once someone downloads the files.
No Volve number appears anywhere until that run exists.

N-W-I-S is not connected to a live rig system and not deployed at Oil India.
The telemetry is a replay generated with the rest of the pack.

## The authored story

The hero moment is authored and the generator builds the field around it.
`packages/synth/src/scenario.ts` fixes the prognosis, the call, the bit depth and three Barail events, and states the arithmetic.
Everything else, including every other event, date and report, comes from seed 26121.
