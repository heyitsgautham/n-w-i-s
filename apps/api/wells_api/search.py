"""Plain-English search over parsed offset events.

The question is read into explicit filters first (event type, formation, radius, years), which the
UI shows back as chips so the engineer can see how it was understood. Whatever words are left rank
the matches by BM25 over each event's own report text. Every result carries its page citation.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

KIND_WORDS = {
    "losses": ["losses", "loss", "lost circulation", "lost returns"],
    "stuck-pipe": ["stuck pipe", "stuck", "sticking"],
    "differential-sticking": ["differential sticking", "differential"],
    "caving": ["caving", "cavings", "pack-off", "packoff", "pack off"],
    "kick": ["kicks", "kick", "influx", "gas influx"],
    "tight-hole": ["tight hole", "tight", "overpull"],
    "bit-balling": ["bit balling", "balling"],
}

STOP = {
    "in",
    "the",
    "of",
    "a",
    "an",
    "and",
    "or",
    "with",
    "for",
    "at",
    "on",
    "to",
    "from",
    "km",
    "within",
    "since",
    "after",
    "before",
    "near",
    "show",
    "me",
    "any",
    "all",
    "wells",
    "well",
    "events",
    "event",
}


@dataclass
class Query:
    text: str
    kinds: list[str] = field(default_factory=list)
    formations: list[str] = field(default_factory=list)
    radius_km: float | None = None
    year_from: int | None = None
    year_to: int | None = None
    terms: list[str] = field(default_factory=list)

    def filters(self) -> list[dict]:
        out = []
        for k in self.kinds:
            out.append({"key": "kind", "value": k})
        for f in self.formations:
            out.append({"key": "formation", "value": f})
        if self.radius_km is not None:
            out.append({"key": "radius", "value": self.radius_km})
        if self.year_from is not None:
            out.append({"key": "yearFrom", "value": self.year_from})
        if self.year_to is not None:
            out.append({"key": "yearTo", "value": self.year_to})
        return out


def parse_query(text: str, formations: list[dict]) -> Query:
    q = Query(text=text)
    s = f" {text.lower()} "
    if m := re.search(r"within\s+(\d+(?:\.\d+)?)\s*km", s):
        q.radius_km = float(m.group(1))
        s = s.replace(m.group(0), " ")
    if m := re.search(r"\b(since|from)\s+(\d{4})\b", s):
        q.year_from = int(m.group(2))
        s = s.replace(m.group(0), " ")
    elif m := re.search(r"\bafter\s+(\d{4})\b", s):
        q.year_from = int(m.group(1)) + 1
        s = s.replace(m.group(0), " ")
    if m := re.search(r"\bbefore\s+(\d{4})\b", s):
        q.year_to = int(m.group(1)) - 1
        s = s.replace(m.group(0), " ")
    for kind, words in KIND_WORDS.items():
        for w in words:
            if re.search(rf"\b{re.escape(w)}\b", s):
                if kind not in q.kinds:
                    q.kinds.append(kind)
                s = re.sub(rf"\b{re.escape(w)}\b", " ", s)
    # Longer names first, so "barail main sand" wins over "barail".
    names = sorted(((f["name"].lower(), f["id"]) for f in formations), key=lambda x: -len(x[0]))
    names += [(f["short"].lower(), f["id"]) for f in formations]
    names += [("coal-shale", "BCS"), ("main sand", "BMS"), ("barail", "BCS"), ("barail", "BMS")]
    for name, fid in names:
        if re.search(rf"\b{re.escape(name)}\b", s):
            if fid not in q.formations:
                q.formations.append(fid)
    for name, _ in names:
        s = re.sub(rf"\b{re.escape(name)}\b", " ", s)
    q.terms = [t for t in re.findall(r"[a-z0-9.]+", s) if t not in STOP and len(t) > 1]
    return q


def formation_at(tops: list[dict], md: float) -> str | None:
    current = None
    for t in sorted(tops, key=lambda t: t["md"]):
        if md >= t["md"]:
            current = t["formationId"]
    return current


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9.]+", text.lower())


def search(query: Query, events: list[dict], wells: dict[str, dict], active_id: str) -> list[dict]:
    active = wells[active_id]
    rows = []
    for e in events:
        if e.get("rejected") or e["md"] is None:
            continue
        well = wells.get(e["wellId"])
        if not well:
            continue
        formation = formation_at(well["tops"], e["md"])
        distance = math.hypot(well["x"] - active["x"], well["y"] - active["y"]) / 1000
        year = int(e["date"][:4])
        if query.kinds and e["kind"] not in query.kinds:
            continue
        if query.formations and formation not in query.formations:
            continue
        if query.radius_km is not None and distance > query.radius_km:
            continue
        if query.year_from is not None and year < query.year_from:
            continue
        if query.year_to is not None and year > query.year_to:
            continue
        rows.append({**e, "formationId": formation, "distanceKm": round(distance, 1)})

    docs = [_tokens(" ".join([r["title"], r["narrative"], r["action"], r["remarks"]])) for r in rows]
    avg = sum(len(d) for d in docs) / len(docs) if docs else 1
    df = {t: sum(1 for d in docs if t in d) for t in set(query.terms)}
    n = len(docs)
    for r, d in zip(rows, docs, strict=True):
        score = 0.0
        for t in query.terms:
            tf = d.count(t)
            if not tf:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * len(d) / avg))
        r["score"] = round(score, 3)
    rows.sort(key=lambda r: (-r["score"], r["date"]), reverse=False)
    if not query.terms:
        rows.sort(key=lambda r: r["date"], reverse=True)
    return rows
