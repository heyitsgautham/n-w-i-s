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
The KN-117 report of 3 February 2018, the one behind the hero alert, is always a clean scan, so the drawer shows OCR reading a page.

## What is real

| Part | What it is |
|---|---|
| Map imagery | Google's satellite imagery of farmland in Dibrugarh district, through the Maps JavaScript API. The wells on it are fictional and so is the field name, and the screen says so |
| Volve reports | 1,759 daily drilling reports from Equinor's Volve field in the North Sea, 1993 to 2016 |
| Geology and drilling facts | The column, the first oil well in 1867, Barail instability and Kopili overpressure, from the sources on the Research screen |

## What runs for real

| Part | What it does |
|---|---|
| Parser | reads all 926 PDFs, text layer or Tesseract OCR, and finds 118 of the 120 planted incidents; on all 118 the type, depth, mud weight and NPT match exactly |
| OCR words | the drawer draws Tesseract's own word boxes for the page, from `/documents/{id}/pages/{n}/words` |
| Hazard rules | read the 23,447 activity comments of the Volve reports and flag 379 hazards; 91 of a random 100 were right when read by hand |
| Correlation | places incidents by formation, re-ties on the call, times alerts against the bit |
| Search | reads a plain-English question into filters and ranks parsed events |
| Briefing | writes the offset review from parsed events and exports a PDF |
| Review gate | keeps low-confidence events off the section until a person confirms them |

## The Volve run

Equinor publishes the Volve field data under the Equinor Open Data Licence.
Its daily reports are WITSML drillReport XML, and `bengsoon/volve_daily_drilling_report` on Hugging Face carries the same 1,759 reports as one Parquet file under CC-BY-4.0.
`uv run python data/volve/fetch.py` downloads that file into `data/volve/.cache/`, which git ignores, and reads every report with the hazard rules in `packages/extract/wells_extract/hazards.py`.
It writes `data/volve/metrics.json`, which the Ingest screen shows.

The rules were written against a development sample of 100 flagged activities.
Then a fresh random sample of 100, drawn with seed 2026 and excluding the first, was read by hand.
91 named the right hazard, 3 named a different real hazard (a spacer gain that was really a loss, and a stuck wireline tool twice), and 6 were not hazards (seals, plugs and trip tank transfers).
The verdicts are in `data/volve/checked-sample.json`, and `fetch.py` refuses to report a hand check that no longer matches the rules.

This is a check of the hazard rules on real report language.
It is not a claim about the Volve wells' true incident count, which nobody labelled.

## What is not done

N-W-I-S is not connected to a live rig system and not deployed at Oil India.
The telemetry is a replay generated with the rest of the pack.

## The authored story

The hero moment is authored and the generator builds the field around it.
`packages/synth/src/scenario.ts` fixes the prognosis, the call, the bit depth, the three Barail events and where the field sits on the map, and states the arithmetic.
Everything else, including every other event, date and report, comes from seed 26121.
