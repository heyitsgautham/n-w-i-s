"""The pre-spud briefing: the screen posts its sections, the API renders a PDF and keeps it for download."""

from __future__ import annotations

import io
import json
import uuid

import pypdfium2 as pdfium
from fastapi import APIRouter, HTTPException, Query
from fastapi import Path as PathParam
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..briefing import briefing_pdf
from ..schemas import BriefingExport
from ..store import StoreDep
from .documents import PDFIUM

router = APIRouter(tags=["briefing"])


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


@router.post("/briefing/pdf")
def export_briefing(body: Briefing, s: StoreDep) -> BriefingExport:
    pdf = briefing_pdf(body.model_dump())
    key = uuid.uuid5(uuid.NAMESPACE_URL, json.dumps(body.model_dump(), sort_keys=True)).hex[:12]
    with s.lock:
        s.briefings.pop(key, None)
        s.briefings[key] = pdf
        while len(s.briefings) > BRIEFINGS_KEPT:
            del s.briefings[next(iter(s.briefings))]
    with PDFIUM:
        pages = len(pdfium.PdfDocument(pdf))
    return BriefingExport(id=key, pages=pages, bytes=len(pdf), url=f"/briefing/{key}.pdf")


@router.get("/briefing/{key}.pdf")
def briefing_file(key: str, s: StoreDep) -> Response:
    pdf = s.briefings.get(key)
    if not pdf:
        raise HTTPException(404, "no such briefing")
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="briefing-{key}.pdf"'},
    )


@router.get("/briefing/{key}/pages/{page}.png")
def briefing_page(
    key: str, s: StoreDep, page: int = PathParam(ge=1), scale: float = Query(1.5, ge=0.5, le=3.0)
) -> Response:
    pdf = s.briefings.get(key)
    if not pdf:
        raise HTTPException(404, "no such briefing")
    with PDFIUM:
        doc = pdfium.PdfDocument(pdf)
        if page < 1 or page > len(doc):
            raise HTTPException(404, "page out of range")
        buf = io.BytesIO()
        doc[page - 1].render(scale=scale).to_pil().save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")
