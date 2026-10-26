"""API over the demo pack and the parsed reports.

Run with `uv run uvicorn wells_api.main:app --port 8121`. Everything it serves comes from
data/demo: field.json from the generator, and extracted/ from the parser run over the rendered PDFs.
"""

from __future__ import annotations

import io
import json
import math
import threading
import time
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Literal

import pypdfium2 as pdfium
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi import Path as PathParam
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from wells_extract.pages import read_lines

from . import config, logs, metrics
from .briefing import briefing_pdf
from .search import formation_at, parse_query, search

SETTINGS = config.load()
DEMO = SETTINGS.data_dir

app = FastAPI(title="Offset-well memory API", version="0.1.0", description="Synthetic demo pack")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-ID"]
)
log = logs.configure(SETTINGS.log_level)


@app.middleware("http")
async def request_log(request: Request, call_next):
    """Logs every request as one JSON line, counts it in /metrics, and returns its id in X-Request-ID.

    A caller's own X-Request-ID is kept, so a request can be traced from the web server through the API.
    An unhandled error is logged with its traceback and answered as JSON carrying the same id.
    """
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    start = time.perf_counter()
    failed = False
    try:
        response = await call_next(request)
    except Exception:
        failed = True
        log.exception("unhandled error", extra={"request_id": rid, "method": request.method, "path": request.url.path})
        response = JSONResponse({"detail": "internal error", "requestId": rid}, status_code=500)
    response.headers["X-Request-ID"] = rid
    metrics.observe(request, response.status_code, time.perf_counter() - start, failed=failed)
    log.info(
        "request",
        extra={
            "request_id": rid,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round((time.perf_counter() - start) * 1000, 1),
        },
    )
    return response


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


@lru_cache(maxsize=1)
def store() -> Store:
    return Store(DEMO)


@app.exception_handler(PackMissing)
def pack_missing(request: Request, exc: PackMissing) -> JSONResponse:
    log.error("demo pack missing", extra={"path": request.url.path, "detail": str(exc)})
    return JSONResponse({"detail": str(exc)}, status_code=503)


def _active() -> dict:
    s = store()
    return s.wells[s.field["activeWellId"]]


def _distance_km(well: dict) -> float:
    a = _active()
    return round(math.hypot(well["x"] - a["x"], well["y"] - a["y"]) / 1000, 2)


@app.get("/health")
def health() -> dict:
    s = store()
    return {
        "ok": True,
        "seed": s.field["seed"],
        "wells": len(s.wells),
        "events": len(s.events),
        "documents": len(s.documents),
    }


@app.get("/metrics", include_in_schema=False)
def prometheus_metrics() -> Response:
    """Request counts, latencies and unhandled errors by route, for a Prometheus scrape."""
    return metrics.exposition()


@app.get("/wells")
def wells() -> list[dict]:
    keys = ["id", "role", "x", "y", "rtElevation", "spudDate", "rig", "tdMd", "releaseDate"]
    return [{**{k: w.get(k) for k in keys}, "distanceKm": _distance_km(w)} for w in store().wells.values()]


@app.get("/wells/{well_id}")
def well(well_id: str) -> dict:
    w = store().wells.get(well_id)
    if not w:
        raise HTTPException(404, f"no well {well_id}")
    return {**{k: v for k, v in w.items() if k != "gammaRay"}, "distanceKm": _distance_km(w)}


@app.get("/wells/{well_id}/tops")
def tops(well_id: str) -> list[dict]:
    return well(well_id)["tops"]


@app.get("/events")
def events(well: str | None = None, kind: str | None = None, formation: str | None = None) -> list[dict]:
    s = store()
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


@app.get("/replay")
def replay() -> dict:
    return store().field["replay"]


@app.get("/documents")
def documents(well: str | None = None) -> list[dict]:
    return [d for d in store().documents.values() if not well or d["wellId"] == well]


@app.get("/documents/{doc_id}.pdf")
def document_pdf(doc_id: str) -> Response:
    s = store()
    d = s.documents.get(doc_id)
    pdf = s.root / "ddr" / d["wellId"] / f"{doc_id}.pdf" if d else None
    if not pdf or not pdf.exists():
        raise HTTPException(404, f"no rendered document {doc_id}")
    return Response(pdf.read_bytes(), media_type="application/pdf")


@app.get("/documents/{doc_id}")
def document(doc_id: str) -> dict:
    s = store()
    d = s.documents.get(doc_id)
    if not d:
        raise HTTPException(404, f"no document {doc_id}")
    pdf = s.root / "ddr" / d["wellId"] / f"{doc_id}.pdf"
    return {**d, "available": pdf.exists(), "events": [e for e in s.live_events() if e["source"]["docId"] == doc_id]}


#: PDFium is not thread-safe, and FastAPI runs these handlers on a thread pool.
PDFIUM = threading.Lock()


@lru_cache(maxsize=256)
def _page_png(path: str, page: int, scale: float) -> bytes:
    with PDFIUM:
        return _render(path, page, scale)


def _render(path: str, page: int, scale: float) -> bytes:
    pdf = pdfium.PdfDocument(path)
    if page < 1 or page > len(pdf):
        raise HTTPException(404, f"page {page} out of range")
    img = pdf[page - 1].render(scale=scale).to_pil()
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@lru_cache(maxsize=64)
def _page_words(path: str, page: int) -> dict:
    # pdfplumber renders through PDFium to key the OCR cache, so it takes the same lock as the PNGs.
    with PDFIUM:
        lines = [line for line in read_lines(Path(path), DEMO / ".cache" / "ocr") if line.page == page]
    return {
        "page": page,
        "ocr": any(line.ocr for line in lines),
        "lines": [
            {"conf": round(line.conf, 3), "words": [[w[0], *(round(v, 1) for v in w[1:])] for w in line.words]}
            for line in lines
        ],
    }


@app.get("/documents/{doc_id}/pages/{page}/words")
def page_words(doc_id: str, page: int = PathParam(ge=1)) -> dict:
    """Every word the parser read on a page, with its box in PDF points, line by line from the top.

    For a scanned page these are Tesseract's own boxes, so the drawer can show where OCR read.
    """
    s = store()
    d = s.documents.get(doc_id)
    pdf = s.root / "ddr" / d["wellId"] / f"{doc_id}.pdf" if d else None
    if not pdf or not pdf.exists():
        raise HTTPException(404, f"no rendered document {doc_id}")
    if page > d["pages"]:
        raise HTTPException(404, f"{doc_id} has {d['pages']} page(s), not {page}")
    return _page_words(str(pdf), page)


@app.get("/documents/{doc_id}/pages/{page}.png")
def page_png(doc_id: str, page: int = PathParam(ge=1), scale: float = Query(2.0, ge=0.5, le=4.0)) -> Response:
    s = store()
    d = s.documents.get(doc_id)
    if not d:
        raise HTTPException(404, f"no document {doc_id}")
    pdf = s.root / "ddr" / d["wellId"] / f"{doc_id}.pdf"
    if not pdf.exists():
        raise HTTPException(404, f"{doc_id} is not rendered in this checkout; run `make demo`")
    return Response(_page_png(str(pdf), page, scale), media_type="image/png", headers={"Cache-Control": "max-age=3600"})


@app.get("/search")
def search_events(q: str = Query(..., min_length=2, max_length=200)) -> dict:
    s = store()
    query = parse_query(q, s.field["formations"])
    results = search(query, s.live_events(), s.wells, s.field["activeWellId"])
    return {"query": q, "filters": query.filters(), "terms": query.terms, "count": len(results), "results": results}


@app.get("/ingestion")
def ingestion() -> dict:
    s = store()
    live = s.live_events()
    return {
        **s.stats,
        "pendingReview": sum(1 for e in live if e["needsReview"]),
        "confirmed": sum(1 for e in live if e["reviewed"] == "confirm"),
        "rejected": sum(1 for e in live if e["reviewed"] == "reject"),
        "scannedDocuments": sum(1 for d in s.documents.values() if d["scanned"]),
        "volve": _volve_metrics(),
    }


def _volve_metrics() -> dict | None:
    path = DEMO.parent / "volve" / "metrics.json"
    return json.loads(path.read_text()) if path.exists() else None


@app.get("/review")
def review_queue() -> list[dict]:
    s = store()
    return [e for e in s.live_events() if e["needsReview"] or (s.decisions.get(e["id"]) is not None)]


@app.get("/review/decisions")
def review_decisions() -> dict[str, str]:
    return dict(store().decisions)


@app.post("/review/reset")
def reset_review() -> dict:
    s = store()
    with s.lock:
        s.decisions.clear()
    return {"ok": True}


class Decision(BaseModel):
    decision: Literal["confirm", "reject"]


@app.post("/review/{event_id}")
def decide(event_id: str, body: Decision) -> dict:
    s = store()
    if not any(e["id"] == event_id for e in s.events):
        raise HTTPException(404, f"no event {event_id}")
    with s.lock:
        s.decisions[event_id] = body.decision
    return {"id": event_id, "decision": body.decision}


class BriefingLine(BaseModel):
    text: str = Field(max_length=2000)
    cites: list[str] = Field(default=[], max_length=50)


class BriefingSection(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=1000)
    lines: list[BriefingLine] = Field(max_length=200)


class Briefing(BaseModel):
    """What the briefing screen exports. The limits sit well above a real briefing and stop a runaway body."""

    title: str = Field(min_length=1, max_length=200)
    subtitle: str = Field(default="", max_length=2000)
    footer: str = Field(default="", max_length=500)
    sections: list[BriefingSection] = Field(min_length=1, max_length=20)


#: Exported briefings kept in memory for download. Each edit exports a new one, so the oldest are dropped.
BRIEFINGS_KEPT = 32


@app.post("/briefing/pdf")
def export_briefing(body: Briefing) -> dict:
    pdf = briefing_pdf(body.model_dump())
    key = uuid.uuid5(uuid.NAMESPACE_URL, json.dumps(body.model_dump(), sort_keys=True)).hex[:12]
    s = store()
    with s.lock:
        s.briefings.pop(key, None)
        s.briefings[key] = pdf
        while len(s.briefings) > BRIEFINGS_KEPT:
            del s.briefings[next(iter(s.briefings))]
    with PDFIUM:
        pages = len(pdfium.PdfDocument(pdf))
    return {"id": key, "pages": pages, "bytes": len(pdf), "url": f"/briefing/{key}.pdf"}


@app.get("/briefing/{key}.pdf")
def briefing_file(key: str) -> Response:
    pdf = store().briefings.get(key)
    if not pdf:
        raise HTTPException(404, "no such briefing")
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="briefing-{key}.pdf"'},
    )


@app.get("/briefing/{key}/pages/{page}.png")
def briefing_page(key: str, page: int = PathParam(ge=1), scale: float = Query(1.5, ge=0.5, le=3.0)) -> Response:
    pdf = store().briefings.get(key)
    if not pdf:
        raise HTTPException(404, "no such briefing")
    with PDFIUM:
        doc = pdfium.PdfDocument(pdf)
        if page < 1 or page > len(doc):
            raise HTTPException(404, "page out of range")
        buf = io.BytesIO()
        doc[page - 1].render(scale=scale).to_pil().save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")
