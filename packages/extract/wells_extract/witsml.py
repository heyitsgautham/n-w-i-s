"""WITSML 1.4 drillReport parser, the format of Equinor's public Volve daily drilling reports.

Each report carries timed activities with a measured depth, a phase, a state and a free-text
comment, plus fluid checks. Hazard events are read from the activity comments with the same
keyword rules the PDF parser falls back on, and cite the file and activity they came from.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from .incidents import KEYWORDS


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _find(el: ET.Element, name: str) -> ET.Element | None:
    return next((c for c in el if _local(c.tag) == name), None)


def _text(el: ET.Element | None, name: str) -> str | None:
    if el is None:
        return None
    child = _find(el, name)
    return child.text.strip() if child is not None and child.text else None


def _depth_m(el: ET.Element | None) -> float | None:
    """Reads a measure element, converting feet when the unit says so."""
    if el is None or el.text is None:
        return None
    value = float(el.text)
    return value * 0.3048 if el.get("uom", "m").lower() in {"ft", "ft_us"} else value


def _density_ppg(el: ET.Element | None) -> float | None:
    if el is None or el.text is None:
        return None
    value = float(el.text)
    uom = el.get("uom", "g/cm3").lower()
    if uom in {"g/cm3", "sg"}:
        return round(value * 8.345, 2)
    if uom in {"kg/m3"}:
        return round(value / 1000 * 8.345, 2)
    return value


def parse_drill_report(path: Path) -> dict:
    root = ET.parse(path).getroot()
    report = next((el for el in root.iter() if _local(el.tag) == "drillReport"), None)
    if report is None:
        raise ValueError(f"{path.name}: no drillReport element")
    well = _text(report, "nameWell") or _text(report, "nameWellbore") or "unknown"
    start = _text(report, "dTimStart")
    fluid_ppg = None
    for el in report:
        if _local(el.tag) == "fluid":
            fluid_ppg = _density_ppg(_find(el, "density")) or fluid_ppg
    activities = []
    events = []
    for i, el in enumerate(a for a in report if _local(a.tag) == "activity"):
        comment = _text(el, "comments") or ""
        md = _depth_m(_find(el, "md"))
        state = (_text(el, "state") or "").lower()
        code = _text(el, "proprietaryCode") or _text(el, "activityCode") or ""
        activities.append({"index": i, "md": md, "state": state, "code": code})
        kind = next((k for k, pat in KEYWORDS if re.search(pat, comment, re.I)), None)
        if kind:
            events.append(
                {
                    "kind": kind,
                    "md": md,
                    "time": _text(el, "dTimStart"),
                    "mudWeightPpg": fluid_ppg,
                    "failedState": state in {"fail", "nok", "failed"},
                    "text": comment,
                    "source": {"file": path.name, "activity": i},
                }
            )
    return {"file": path.name, "well": well, "start": start, "activities": len(activities), "events": events}
