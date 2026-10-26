"""Parses every rendered report in the demo pack and scores the result against the generator's truth.

Writes data/demo/extracted/events.json, documents.json and stats.json. The web app and the API read
these files, so every alert on screen comes from a parsed page, not from the generator directly.
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from .incidents import REVIEW_THRESHOLD, parse_report
from .pages import read_lines

ROOT = Path(__file__).resolve().parents[3]
DEMO = ROOT / "data" / "demo"
CACHE = DEMO / ".cache" / "ocr"


def _parse(args: tuple[str, str, str]) -> dict:
    doc_id, well_id, path = args
    lines = read_lines(Path(path), CACHE)
    events = parse_report(lines, doc_id)
    ocr = [line for line in lines if line.ocr]
    pages = sorted({line.page for line in lines})
    return {
        "doc": {
            "docId": doc_id,
            "wellId": well_id,
            "pages": len(pages),
            "ocrPages": len({line.page for line in ocr}),
            "lines": len(lines),
            "ocrConfidence": round(sum(line.conf for line in ocr) / len(ocr), 3) if ocr else None,
            "incidents": len(events),
        },
        "events": events,
    }


def histogram(values: list[float], lo: float = 0.5, step: float = 0.05) -> list[dict]:
    bins = []
    edge = lo
    while edge < 1.0 - 1e-9:
        hi = round(edge + step, 2)
        n = sum(1 for v in values if (edge <= v < hi) or (hi >= 1.0 and v >= edge))
        bins.append({"from": round(edge, 2), "to": hi, "count": n})
        edge = hi
    below = sum(1 for v in values if v < lo)
    if below:
        bins.insert(0, {"from": 0.0, "to": lo, "count": below})
    return bins


def accuracy(extracted: list[dict], truth: list[dict], scanned: dict[str, bool]) -> dict:
    """Pairs each true event with a parsed event from the same report, nearest in depth first.

    Each parsed event pairs with one true event at most, so a report with two incidents and one parsed
    counts one found and one missed. Fields are scored over the events found, so a miss counts once,
    as a miss, and is named.
    """
    match = _pair_by_depth(extracted, truth)
    found = kind = depth = mw = npt = 0
    missed = []
    for t in truth:
        best = match.get(t["id"])
        if best is None:
            missed.append(
                {"id": t["id"], "docId": t["source"]["docId"], "scanned": scanned.get(t["source"]["docId"], False)}
            )
            continue
        found += 1
        kind += best["kind"] == t["kind"]
        depth += best["md"] is not None and abs(best["md"] - t["md"]) < 0.05
        mw += best["mudWeightPpg"] == t["mudWeightPpg"]
        npt += best["nptHours"] == t["nptHours"]
    return {
        "truthEvents": len(truth),
        "extractedEvents": len(extracted),
        "found": found,
        "kindRight": kind,
        "depthExact": depth,
        "mudWeightExact": mw,
        "nptExact": npt,
        "missed": missed,
    }


def _pair_by_depth(extracted: list[dict], truth: list[dict]) -> dict[str, dict]:
    """True event id to its parsed event. Within a report, the closest pair in depth is taken first."""
    parsed: dict[str, list[dict]] = {}
    for e in extracted:
        parsed.setdefault(e["source"]["docId"], []).append(e)
    planted: dict[str, list[dict]] = {}
    for t in truth:
        planted.setdefault(t["source"]["docId"], []).append(t)
    match: dict[str, dict] = {}
    for doc, ts in planted.items():
        cands = parsed.get(doc, [])
        pairs = sorted((abs((e["md"] or -1e9) - t["md"]), i, j) for i, t in enumerate(ts) for j, e in enumerate(cands))
        used_t: set[int] = set()
        used_e: set[int] = set()
        for _, i, j in pairs:
            if i not in used_t and j not in used_e:
                used_t.add(i)
                used_e.add(j)
                match[ts[i]["id"]] = cands[j]
    return match


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--jobs", type=int, default=8)
    args = ap.parse_args(argv)

    manifest = json.loads((DEMO / "ddr" / "manifest.json").read_text())
    field = json.loads((DEMO / "field.json").read_text())
    jobs = [(m["docId"], m["wellId"], str(DEMO / "ddr" / m["wellId"] / f"{m['docId']}.pdf")) for m in manifest]
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        results = list(pool.map(_parse, jobs, chunksize=4))

    scanned = {m["docId"]: m["scanned"] for m in manifest}
    documents = [{**r["doc"], "date": r["doc"]["docId"][-10:], "scanned": scanned[r["doc"]["docId"]]} for r in results]
    events = sorted((e for r in results for e in r["events"]), key=lambda e: (e["wellId"], e["md"] or 0))
    rendered_wells = {m["wellId"] for m in manifest}
    truth = [e for e in field["events"] if e["wellId"] in rendered_wells]

    ocr_confs = [d["ocrConfidence"] for d in documents if d["ocrConfidence"] is not None]
    stats = {
        "documents": len(documents),
        "pages": sum(d["pages"] for d in documents),
        "ocrPages": sum(d["ocrPages"] for d in documents),
        "textPages": sum(d["pages"] - d["ocrPages"] for d in documents),
        "wells": len(rendered_wells),
        "events": len(events),
        "needsReview": sum(1 for e in events if e["needsReview"]),
        "reviewThreshold": REVIEW_THRESHOLD,
        "eventConfidence": histogram([e["confidence"] for e in events]),
        "ocrPageConfidence": histogram(ocr_confs),
        "accuracy": accuracy(events, truth, scanned),
    }
    out = DEMO / "extracted"
    out.mkdir(parents=True, exist_ok=True)
    (out / "events.json").write_text(json.dumps(events, indent=1) + "\n")
    (out / "documents.json").write_text(json.dumps(documents, indent=1) + "\n")
    (out / "stats.json").write_text(json.dumps(stats, indent=1) + "\n")
    a = stats["accuracy"]
    print(
        f"parsed {stats['documents']} reports, {stats['pages']} pages ({stats['ocrPages']} by OCR): "
        f"{stats['events']} events, {stats['needsReview']} for review. "
        f"found {a['found']} of {a['truthEvents']}; of those, kind {a['kindRight']}, depth {a['depthExact']}, "
        f"mud weight {a['mudWeightExact']}, NPT {a['nptExact']}; missed {[m['id'] for m in a['missed']]}"
    )


if __name__ == "__main__":
    main()
