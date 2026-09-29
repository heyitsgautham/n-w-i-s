"""WITSML 1.4 drillReport reports, the format of Equinor's public Volve daily drilling reports.

Each report carries timed activities with a measured depth, a state and a free-text comment, plus
fluid checks. Hazards are read from the comments with the same rules the PDF parser falls back on,
and each one cites the report and the activity it came from.

`report_events` works on the report as plain fields, so it reads the raw XML through
`parse_drill_report` and the Hugging Face conversion of the same reports through `wells_extract.volve`.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path

from .hazards import classify

#: Volve writes -999.99 for a value nobody recorded.
MISSING = -999.99


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _find(el: ET.Element, name: str) -> ET.Element | None:
    return next((c for c in el if _local(c.tag) == name), None)


def _text(el: ET.Element | None, name: str) -> str | None:
    if el is None:
        return None
    child = _find(el, name)
    return child.text.strip() if child is not None and child.text else None


def _num(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        v = float(value.replace(",", "."))
    except ValueError:
        return None
    return None if v == MISSING else v


def _depth_m(el: ET.Element | None) -> float | None:
    """Reads a measure element, converting feet when the unit says so."""
    if el is None or el.text is None:
        return None
    value = _num(el.text)
    if value is None:
        return None
    return value * 0.3048 if el.get("uom", "m").lower() in {"ft", "ft_us"} else value


def sg_to_ppg(sg: float | None) -> float | None:
    return round(sg * 8.345, 2) if sg is not None else None


def report_events(report: dict, source: str) -> dict:
    """Hazard events from one report given as fields: nameWell, dTimStart, fluid and activity lists.

    Depths are metres and fluid densities are specific gravity, as Volve records them.
    """
    densities = [_num(f.get("density")) for f in report.get("fluid") or []]
    fluid_ppg = sg_to_ppg(next((d for d in reversed(densities) if d), None))
    activities = report.get("activity") or []
    events = []
    for i, a in enumerate(activities):
        comment = a.get("comments") or ""
        kind = classify(comment)
        if kind is None:
            continue
        events.append(
            {
                "kind": kind,
                "md": _num(a.get("md")),
                "time": a.get("dTimStart"),
                "mudWeightPpg": fluid_ppg,
                "failedState": (a.get("state") or "").lower() in {"fail", "nok", "failed"},
                "text": comment,
                "source": {"report": source, "activity": i},
            }
        )
    return {
        "report": source,
        "well": report.get("nameWell") or report.get("nameWellbore") or "unknown",
        "start": report.get("dTimStart"),
        "activities": len(activities),
        "events": events,
    }


def parse_drill_report(path: Path) -> dict:
    root = ET.parse(path).getroot()
    report = next((el for el in root.iter() if _local(el.tag) == "drillReport"), None)
    if report is None:
        raise ValueError(f"{path.name}: no drillReport element")
    fields: dict = {
        "nameWell": _text(report, "nameWell"),
        "nameWellbore": _text(report, "nameWellbore"),
        "dTimStart": _text(report, "dTimStart"),
        "fluid": [],
        "activity": [],
    }
    for el in report:
        name = _local(el.tag)
        if name == "fluid":
            density = _find(el, "density")
            sg = _num(density.text) if density is not None else None
            # The fields carry specific gravity, so a density in kg/m3 is scaled down to it.
            if sg is not None and density is not None and density.get("uom", "").lower() == "kg/m3":
                sg /= 1000
            fields["fluid"].append({"density": None if sg is None else str(sg)})
        elif name == "activity":
            md = _depth_m(_find(el, "md"))
            fields["activity"].append(
                {
                    "comments": _text(el, "comments"),
                    "md": None if md is None else str(md),
                    "dTimStart": _text(el, "dTimStart"),
                    "state": _text(el, "state"),
                }
            )
    return report_events(fields, path.name)
