"""Exports the pre-spud briefing to PDF, every line with its citations."""

from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#555555")
TITLE = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=INK)
SUB = ParagraphStyle("s", fontName="Helvetica", fontSize=8.5, leading=11, textColor=MUTED)
H = ParagraphStyle(
    "h", fontName="Helvetica-Bold", fontSize=10.5, leading=14, spaceBefore=10, spaceAfter=3, textColor=INK
)
LINE = ParagraphStyle("l", fontName="Helvetica", fontSize=9, leading=12, leftIndent=10, bulletIndent=0, textColor=INK)
CITE = ParagraphStyle("c", fontName="Helvetica", fontSize=7.5, leading=10, leftIndent=10, textColor=MUTED, spaceAfter=4)


_EIGHTHS = {"⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8"}


def _esc(s: str) -> str:
    """Escapes for reportlab markup, and spells out the eighths Helvetica has no glyph for."""
    for glyph, ascii_ in _EIGHTHS.items():
        s = s.replace(glyph, ascii_)
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def briefing_pdf(body: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=body.get("title", "Briefing"),
    )
    story = [
        Paragraph(_esc(body.get("title", "Offset review")), TITLE),
        Paragraph(_esc(body.get("subtitle", "")), SUB),
        Spacer(1, 6),
    ]
    for section in body.get("sections", []):
        story.append(Paragraph(_esc(section["title"]), H))
        if section.get("summary"):
            story.append(Paragraph(_esc(section["summary"]), SUB))
        for line in section.get("lines", []):
            story.append(Paragraph(_esc(line["text"]), LINE, bulletText="•"))
            cites = "; ".join(line.get("cites", []))
            if cites:
                story.append(Paragraph(_esc(cites), CITE))
    story += [Spacer(1, 10), Paragraph(_esc(body.get("footer", "Synthetic demo pack. Not Oil India data.")), SUB)]
    doc.build(story)
    return buf.getvalue()
