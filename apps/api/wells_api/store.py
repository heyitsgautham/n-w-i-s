"""The demo pack in memory, and the dependency that hands it to each route."""

from __future__ import annotations

import json
import math
import threading
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Request


class PackMissing(Exception):
    """The demo pack has not been generated, or WELLS_DATA_DIR points somewhere else."""


class Store:
    """The pack is read once. Review decisions live in memory and reset with the demo."""

    def __init__(self, root: Path):
        missing = [p for p in ("field.json", "extracted/events.json") if not (root / p).exists()]
        if missing:
            raise PackMissing(
                f"no demo pack at {root}: {', '.join(missing)} missing. Run `make data` or set WELLS_DATA_DIR."
            )
        self.root = root
        self.field = json.loads((root / "field.json").read_text())
        self.events = json.loads((root / "extracted" / "events.json").read_text())
        self.documents = {d["docId"]: d for d in json.loads((root / "extracted" / "documents.json").read_text())}
        self.stats = json.loads((root / "extracted" / "stats.json").read_text())
        self.wells = {w["id"]: w for w in self.field["wells"]}
        self.decisions: dict[str, str] = {}
        self.briefings: dict[str, bytes] = {}
        self.lock = threading.Lock()

    def event_view(self, e: dict) -> dict:
        decision = self.decisions.get(e["id"])
        return {
            **e,
            "needsReview": e["needsReview"] and decision is None,
            "rejected": decision == "reject",
            "reviewed": decision,
        }

    def live_events(self) -> list[dict]:
        return [self.event_view(e) for e in self.events]

    def distance_km(self, well: dict) -> float:
        """Straight-line distance from the active well, in km."""
        a = self.wells[self.field["activeWellId"]]
        return round(math.hypot(well["x"] - a["x"], well["y"] - a["y"]) / 1000, 2)

    def pdf_path(self, doc: dict) -> Path:
        """Where the renderer writes a report's PDF. It may not exist in a checkout that has not run `make data`."""
        return self.root / "ddr" / doc["wellId"] / f"{doc['docId']}.pdf"


@lru_cache(maxsize=1)
def load(root: Path) -> Store:
    return Store(root)


def get_store(request: Request) -> Store:
    """The pack under the app's data_dir, read on first use. Raises PackMissing, which the app answers with 503."""
    return load(request.app.state.data_dir)


StoreDep = Annotated[Store, Depends(get_store)]
