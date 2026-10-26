"""Wells, their tops, the parsed events, the replay, and search over the events."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..schemas import EventKind
from ..search import formation_at, parse_query, search
from ..store import StoreDep

router = APIRouter(tags=["wells"])


@router.get("/wells")
def wells(s: StoreDep) -> list[dict]:
    keys = ["id", "role", "x", "y", "rtElevation", "spudDate", "rig", "tdMd", "releaseDate"]
    return [{**{k: w.get(k) for k in keys}, "distanceKm": s.distance_km(w)} for w in s.wells.values()]


def _well(s: StoreDep, well_id: str) -> dict:
    w = s.wells.get(well_id)
    if not w:
        raise HTTPException(404, f"no well {well_id}")
    return w


@router.get("/wells/{well_id}")
def well(well_id: str, s: StoreDep) -> dict:
    w = _well(s, well_id)
    return {**{k: v for k, v in w.items() if k != "gammaRay"}, "distanceKm": s.distance_km(w)}


@router.get("/wells/{well_id}/tops")
def tops(well_id: str, s: StoreDep) -> list[dict]:
    return _well(s, well_id)["tops"]


def check_well(s: StoreDep, well: str | None) -> None:
    """A filter naming a well the pack does not have is a mistake, not an empty result."""
    if well and well not in s.wells:
        raise HTTPException(422, f"unknown well {well}")


@router.get("/events")
def events(
    s: StoreDep, well: str | None = None, kind: EventKind | None = None, formation: str | None = None
) -> list[dict]:
    check_well(s, well)
    if formation and formation not in {f["id"] for f in s.field["formations"]}:
        raise HTTPException(422, f"unknown formation {formation}")
    out = []
    for e in s.live_events():
        if well and e["wellId"] != well:
            continue
        if kind and e["kind"] != kind:
            continue
        f = formation_at(s.wells[e["wellId"]]["tops"], e["md"]) if e["md"] is not None else None
        if formation and f != formation:
            continue
        out.append({**e, "formationId": f})
    return out


@router.get("/replay")
def replay(s: StoreDep) -> dict:
    return s.field["replay"]


@router.get("/search")
def search_events(s: StoreDep, q: str = Query(..., min_length=2, max_length=200)) -> dict:
    query = parse_query(q, s.field["formations"])
    results = search(query, s.live_events(), s.wells, s.field["activeWellId"])
    return {"query": q, "filters": query.filters(), "terms": query.terms, "count": len(results), "results": results}
