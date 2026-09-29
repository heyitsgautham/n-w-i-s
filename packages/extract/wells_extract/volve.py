"""Reads Equinor's Volve daily drilling reports and scores the hazard reader against a hand check.

The reports come from the Hugging Face conversion of the Volve WITSML drillReport files
(`bengsoon/volve_daily_drilling_report`, CC-BY-4.0), one row per report with the same field names
as the XML. `witsml.report_events` reads each row exactly as it reads a raw XML report.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from .witsml import report_events

SOURCE = (
    "Equinor Volve field data set, daily drilling reports, "
    "via the Hugging Face conversion bengsoon/volve_daily_drilling_report (CC-BY-4.0)"
)


def load_reports(parquet: Path) -> list[dict]:
    import pyarrow.parquet as pq

    return pq.read_table(parquet).to_pylist()


def summarise(reports: list[dict], checked: dict | None) -> dict:
    parsed = [report_events(r, r["docName"]) for r in reports]
    events = [e for p in parsed for e in p["events"]]
    by_kind = Counter(e["kind"] for e in events)
    wells = {p["well"] for p in parsed}
    flagged = {(e["source"]["report"], e["source"]["activity"]): e for e in events}
    examples = {}
    for kind in by_kind:
        # The shortest clear line of each kind, so the screen can quote real report text.
        pool = [e for e in events if e["kind"] == kind and e["md"] and 30 <= len(e["text"]) <= 120]
        if pool:
            e = min(pool, key=lambda e: (len(e["text"]), e["source"]["report"]))
            examples[kind] = {"text": " ".join(e["text"].split()), "report": e["source"]["report"], "md": e["md"]}
    out = {
        "source": SOURCE,
        "reports": len(parsed),
        "wells": len(wells),
        "activities": sum(p["activities"] for p in parsed),
        "hazardActivities": len(events),
        "reportsWithHazard": sum(1 for p in parsed if p["events"]),
        "byKind": dict(by_kind.most_common()),
        "examples": examples,
    }
    if checked:
        entries = checked["entries"]
        stale = [e for e in entries if flagged.get((e["report"], e["activity"]), {}).get("kind") != e["flagged"]]
        if stale:
            raise ValueError(f"{len(stale)} hand-checked entries no longer match the reader; re-check them")
        verdicts = Counter(e["verdict"] for e in entries)
        out["handCheck"] = {
            "sample": len(entries),
            "seed": checked["seed"],
            "right": verdicts["right"],
            "otherHazard": verdicts["other-hazard"],
            "notAHazard": verdicts["not-a-hazard"],
        }
    return out
