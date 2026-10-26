"""The daily reports: their metadata, the rendered PDFs, page images and the words the parser read."""

from __future__ import annotations

import io
import threading
from functools import lru_cache
from pathlib import Path

import pypdfium2 as pdfium
from fastapi import APIRouter, HTTPException, Query
from fastapi import Path as PathParam
from fastapi.responses import Response
from wells_extract.pages import read_lines

from ..store import StoreDep
from .wells import check_well

router = APIRouter(tags=["documents"])

#: PDFium is not thread-safe, and FastAPI runs these handlers on a thread pool.
PDFIUM = threading.Lock()


@router.get("/documents")
def documents(s: StoreDep, well: str | None = None) -> list[dict]:
    check_well(s, well)
    return [d for d in s.documents.values() if not well or d["wellId"] == well]


@router.get("/documents/{doc_id}.pdf")
def document_pdf(doc_id: str, s: StoreDep) -> Response:
    d = s.documents.get(doc_id)
    pdf = s.pdf_path(d) if d else None
    if not pdf or not pdf.exists():
        raise HTTPException(404, f"no rendered document {doc_id}")
    return Response(pdf.read_bytes(), media_type="application/pdf")


@router.get("/documents/{doc_id}")
def document(doc_id: str, s: StoreDep) -> dict:
    d = s.documents.get(doc_id)
    if not d:
        raise HTTPException(404, f"no document {doc_id}")
    events = [e for e in s.live_events() if e["source"]["docId"] == doc_id]
    return {**d, "available": s.pdf_path(d).exists(), "events": events}


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
def _page_words(path: str, page: int, ocr_cache: str) -> dict:
    # pdfplumber renders through PDFium to key the OCR cache, so it takes the same lock as the PNGs.
    with PDFIUM:
        lines = [line for line in read_lines(Path(path), Path(ocr_cache)) if line.page == page]
    return {
        "page": page,
        "ocr": any(line.ocr for line in lines),
        "lines": [
            {"conf": round(line.conf, 3), "words": [[w[0], *(round(v, 1) for v in w[1:])] for w in line.words]}
            for line in lines
        ],
    }


@router.get("/documents/{doc_id}/pages/{page}/words")
def page_words(doc_id: str, s: StoreDep, page: int = PathParam(ge=1)) -> dict:
    """Every word the parser read on a page, with its box in PDF points, line by line from the top.

    For a scanned page these are Tesseract's own boxes, so the drawer can show where OCR read.
    """
    d = s.documents.get(doc_id)
    if not d or not s.pdf_path(d).exists():
        raise HTTPException(404, f"no rendered document {doc_id}")
    pdf = s.pdf_path(d)
    if page > d["pages"]:
        raise HTTPException(404, f"{doc_id} has {d['pages']} page(s), not {page}")
    return _page_words(str(pdf), page, str(s.root / ".cache" / "ocr"))


@router.get("/documents/{doc_id}/pages/{page}.png")
def page_png(
    doc_id: str, s: StoreDep, page: int = PathParam(ge=1), scale: float = Query(2.0, ge=0.5, le=4.0)
) -> Response:
    d = s.documents.get(doc_id)
    if not d:
        raise HTTPException(404, f"no document {doc_id}")
    pdf = s.pdf_path(d)
    if not pdf.exists():
        raise HTTPException(404, f"{doc_id} is not rendered in this checkout; run `make demo`")
    return Response(_page_png(str(pdf), page, scale), media_type="image/png", headers={"Cache-Control": "max-age=3600"})
