"""The review queue: events read with low confidence wait here until a person confirms or rejects them."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..store import StoreDep

router = APIRouter(tags=["review"])


@router.get("/ingestion")
def ingestion(s: StoreDep) -> dict:
    live = s.live_events()
    return {
        **s.stats,
        "pendingReview": sum(1 for e in live if e["needsReview"]),
        "confirmed": sum(1 for e in live if e["reviewed"] == "confirm"),
        "rejected": sum(1 for e in live if e["reviewed"] == "reject"),
        "scannedDocuments": sum(1 for d in s.documents.values() if d["scanned"]),
        "volve": _volve_metrics(s.root),
    }


def _volve_metrics(root: Path) -> dict | None:
    path = root.parent / "volve" / "metrics.json"
    return json.loads(path.read_text()) if path.exists() else None


@router.get("/review")
def review_queue(s: StoreDep) -> list[dict]:
    return [e for e in s.live_events() if e["needsReview"] or (s.decisions.get(e["id"]) is not None)]


@router.get("/review/decisions")
def review_decisions(s: StoreDep) -> dict[str, str]:
    return dict(s.decisions)


@router.post("/review/reset")
def reset_review(s: StoreDep) -> dict:
    with s.lock:
        s.decisions.clear()
    return {"ok": True}


class Decision(BaseModel):
    decision: Literal["confirm", "reject"]


@router.post("/review/{event_id}")
def decide(event_id: str, body: Decision, s: StoreDep) -> dict:
    if not any(e["id"] == event_id for e in s.events):
        raise HTTPException(404, f"no event {event_id}")
    with s.lock:
        s.decisions[event_id] = body.decision
    return {"id": event_id, "decision": body.decision}
