"""Renders the demo pack's daily drilling reports to PDF.

Each report follows the usual layout: header, 24-hour summary and forecast, operations table,
incidents with NPT, mud properties, bit record and surveys. Every page is stamped as a synthetic
report. One report in five is "scanned": rasterised to a greyscale image with no text layer, so the
parser's OCR path runs on real pixels.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import random
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageFilter
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[4]
DEMO = ROOT / "data" / "demo"
SCAN_DPI = 200

KIND_LABEL = {
    "caving": "CAVING",
    "stuck-pipe": "STUCK PIPE",
    "losses": "LOSSES",
    "tight-hole": "TIGHT HOLE",
    "bit-balling": "BIT BALLING",
    "differential-sticking": "DIFFERENTIAL STICKING",
    "kick": "KICK",
}

INK = colors.HexColor("#111111")
RULE = colors.HexColor("#888888")
SHADE = colors.HexColor("#e9e9e9")

BODY = ParagraphStyle("body", fontName="Helvetica", fontSize=8.4, leading=10.6, textColor=INK, alignment=TA_LEFT)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=7.8, leading=9.6)
HEAD = ParagraphStyle(
    "head", parent=BODY, fontName="Helvetica-Bold", fontSize=8.6, leading=11, spaceBefore=6, spaceAfter=3
)
INC = ParagraphStyle("inc", parent=BODY, fontSize=8.4, leading=10.8)


#: Helvetica has ¼ and ½ but not the eighths, so casing sizes are written the way a typewriter would.
_EIGHTHS = {"⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8"}


def pdf_text(s: str) -> str:
    for glyph, ascii_ in _EIGHTHS.items():
        s = s.replace(glyph, ascii_)
    return s


def is_scanned(doc_id: str) -> bool:
    """One report in five, chosen by a hash of its id so the choice never moves."""
    return int(hashlib.sha1(doc_id.encode()).hexdigest()[:8], 16) % 5 == 0


def fmt_m(v: float, decimals: int = 0) -> str:
    return f"{v:,.{decimals}f}"


def _numbered(meta: dict):
    """Page furniture: title band, synthetic stamp and page numbers."""

    class NumberedCanvas(rl_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._pages: list[dict] = []

        def showPage(self):  # noqa: N802 - reportlab API
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self._furniture(total)
                super().showPage()
            super().save()

        def _furniture(self, total: int):
            w, h = A4
            self.setFillColor(INK)
            self.setFont("Helvetica-Bold", 11)
            self.drawString(16 * mm, h - 14 * mm, "DAILY DRILLING REPORT")
            self.setFont("Helvetica", 8)
            self.drawRightString(
                w - 16 * mm,
                h - 14 * mm,
                f"{meta['field']} field  |  {meta['well']}  |  Report {meta['no']}  |  {meta['date']}",
            )
            self.setStrokeColor(INK)
            self.setLineWidth(0.8)
            self.line(16 * mm, h - 16.5 * mm, w - 16 * mm, h - 16.5 * mm)
            self.setFont("Helvetica-Bold", 7.5)
            self.drawString(16 * mm, 10 * mm, "SYNTHETIC REPORT")
            self.setFont("Helvetica", 7.5)
            self.drawString(
                44 * mm, 10 * mm, f"N-W-I-S demo pack, seed {meta['seed']}. Not Oil India data.  {meta['doc']}"
            )
            self.drawRightString(w - 16 * mm, 10 * mm, f"Page {self._pageNumber} of {total}")
            self.setStrokeColor(RULE)
            self.setLineWidth(0.4)
            self.line(16 * mm, 13.5 * mm, w - 16 * mm, 13.5 * mm)

    return NumberedCanvas


def _table(rows, widths, header=True, font=7.8):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", font),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [("FONT", (0, 0), (-1, 0), "Helvetica-Bold", font), ("BACKGROUND", (0, 0), (-1, 0), SHADE)]
    t.setStyle(TableStyle(style))
    return t


def _clean(v):
    if isinstance(v, str):
        return pdf_text(v)
    if isinstance(v, list):
        return [_clean(x) for x in v]
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    return v


def build_pdf(report: dict, well: dict, field: dict, seed: int) -> bytes:
    report = _clean(report)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=21 * mm,
        bottomMargin=18 * mm,
        title=f"DDR {report['id']}",
        author="N-W-I-S synthetic demo pack",
    )
    days = report["reportNo"]
    header = [
        ["Well", report["wellId"], "Rig", well["rig"], "Report no", str(report["reportNo"]), "Date", report["date"]],
        [
            "Hole size",
            f"{report['holeSizeIn']} in",
            "Depth 00:00",
            f"{fmt_m(report['startMd'], 1)} m MD",
            "Depth 24:00",
            f"{fmt_m(report['endMd'], 1)} m MD",
            "TVD 24:00",
            f"{fmt_m(report['endTvd'], 1)} m",
        ],
        [
            "Spud date",
            well["spudDate"],
            "Days from spud",
            str(days),
            "RT elevation",
            f"{well['rtElevation']} m",
            "Field",
            field["name"],
        ],
    ]
    ht = Table(header, colWidths=[18 * mm, 22 * mm, 25 * mm, 23 * mm, 22 * mm, 24 * mm, 20 * mm, 24 * mm])
    ht.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 7.8),
                ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 7.8),
                ("FONT", (2, 0), (2, -1), "Helvetica-Bold", 7.8),
                ("FONT", (4, 0), (4, -1), "Helvetica-Bold", 7.8),
                ("FONT", (6, 0), (6, -1), "Helvetica-Bold", 7.8),
                ("GRID", (0, 0), (-1, -1), 0.3, RULE),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ]
        )
    )
    story = [ht, Spacer(1, 4)]
    story += [Paragraph("24 H SUMMARY", HEAD), Paragraph(report["summary"], BODY)]
    story += [Paragraph("24 H FORECAST", HEAD), Paragraph(report["forecast"], BODY)]

    ops = [["From", "To", "Hrs", "Code", "Depth m", "Operation"]]
    for op in report["ops"]:
        ops.append(
            [op["from"], op["to"], f"{op['hours']:.2f}", op["code"], fmt_m(op["md"], 1), Paragraph(op["text"], CELL)]
        )
    story += [Paragraph("OPERATIONS", HEAD), _table(ops, [12 * mm, 12 * mm, 11 * mm, 12 * mm, 17 * mm, 114 * mm])]

    if report["incidents"]:
        story.append(Paragraph("INCIDENTS AND NPT", HEAD))
        for inc in report["incidents"]:
            block = [
                Paragraph(f"<b>INCIDENT {inc['eventId']}  |  {KIND_LABEL[inc['kind']]}</b>", INC),
                Paragraph(f"<b>Title:</b> {inc['title']}", INC),
                Paragraph(
                    f"<b>Start:</b> {inc['time']}   <b>Depth:</b> {fmt_m(inc['md'], 1)} m MD   "
                    f"<b>MW:</b> {inc['mudWeightPpg']:.1f} ppg   <b>NPT:</b> {inc['nptHours']:.1f} h",
                    INC,
                ),
                Paragraph(f"<b>Description:</b> {inc['description']}", INC),
                Paragraph(f"<b>Action:</b> {inc['action']}", INC),
                Paragraph(f"<b>Remarks:</b> {inc['remarks']}", INC),
                Spacer(1, 4),
            ]
            story.append(KeepTogether(block))

    mud = report["mud"]
    story += [
        Paragraph("MUD PROPERTIES", HEAD),
        _table(
            [
                ["Type", "Mud weight", "Funnel vis", "PV", "YP", "Fluid loss"],
                [
                    mud["type"],
                    f"{mud['weightPpg']:.1f} ppg",
                    f"{mud['funnelVisS']} s",
                    f"{mud['pv']} cP",
                    f"{mud['yp']} lb/100 ft²",
                    f"{mud['fluidLossMl']} ml",
                ],
            ],
            [44 * mm, 24 * mm, 22 * mm, 18 * mm, 30 * mm, 24 * mm],
        ),
    ]
    bit = report.get("bit")
    if bit:
        story += [
            Paragraph("BIT RECORD", HEAD),
            _table(
                [
                    ["Bit no", "Size", "Type", "Depth in", "Metres", "Hours"],
                    [
                        str(bit["no"]),
                        f"{bit['sizeIn']} in",
                        bit["type"],
                        f"{fmt_m(bit['depthInMd'], 1)} m",
                        fmt_m(bit["metres"], 1),
                        f"{bit['hours']:.1f}",
                    ],
                ],
                [16 * mm, 16 * mm, 40 * mm, 26 * mm, 22 * mm, 20 * mm],
            ),
        ]
    if report["surveys"]:
        rows = [["MD m", "Inc deg", "Azi deg", "TVD m"]] + [
            [fmt_m(s["md"], 1), f"{s['inc']:.2f}", f"{s['azi']:.1f}", fmt_m(s["tvd"], 1)]
            for s in report["surveys"][:12]
        ]
        story += [Paragraph("SURVEYS", HEAD), _table(rows, [24 * mm, 20 * mm, 20 * mm, 24 * mm])]

    meta = {
        "field": field["name"],
        "well": report["wellId"],
        "no": report["reportNo"],
        "date": report["date"],
        "seed": seed,
        "doc": report["id"],
    }
    doc.build(story, canvasmaker=_numbered(meta))
    return buf.getvalue()


def scan(pdf_bytes: bytes, doc_id: str) -> bytes:
    """Rasterises every page to greyscale with a little scanner noise and rebuilds an image-only PDF."""
    rnd = random.Random(doc_id)
    pdf = pdfium.PdfDocument(pdf_bytes)
    out = io.BytesIO()
    c = rl_canvas.Canvas(out, pagesize=A4)
    for i in range(len(pdf)):
        page = pdf[i]
        img = page.render(scale=SCAN_DPI / 72).to_pil().convert("L")
        # About a third of scans arrive faxed or photocopied twice: softer, noisier, lossier.
        poor = rnd.random() < 0.35
        if poor:
            small = img.resize((int(img.width * 0.52), int(img.height * 0.52)), Image.BILINEAR)
            img = small.resize(img.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(radius=rnd.uniform(0.5, 0.8)))
        else:
            img = img.filter(ImageFilter.GaussianBlur(radius=rnd.uniform(0.35, 0.6)))
        noise = Image.effect_noise(img.size, rnd.uniform(14, 22) if poor else rnd.uniform(6, 10)).point(
            lambda v: 255 if v > 30 else 200
        )
        img = Image.composite(img, noise.convert("L"), Image.new("L", img.size, 225 if poor else 235))
        jpg = io.BytesIO()
        img.save(jpg, format="JPEG", quality=34 if poor else 62)
        jpg.seek(0)
        from reportlab.lib.utils import ImageReader

        c.drawImage(ImageReader(jpg), 0, 0, width=A4[0], height=A4[1])
        c.showPage()
    c.save()
    return out.getvalue()


def _render_one(args):
    report, well, field, seed, out_dir = args
    pdf = build_pdf(report, well, field, seed)
    scanned = is_scanned(report["id"])
    if scanned:
        pdf = scan(pdf, report["id"])
    target = Path(out_dir) / report["wellId"] / f"{report['id']}.pdf"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(pdf)
    pages = len(pdfium.PdfDocument(pdf))
    return {
        "docId": report["id"],
        "wellId": report["wellId"],
        "date": report["date"],
        "pages": pages,
        "scanned": scanned,
    }


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--wells", nargs="*", help="only these wells (default: every offset)")
    ap.add_argument("--out", default=str(DEMO / "ddr"))
    ap.add_argument("--jobs", type=int, default=8)
    args = ap.parse_args(argv)

    field = json.loads((DEMO / "field.json").read_text())
    reports = json.loads((DEMO / "reports.json").read_text())
    wells = {w["id"]: w for w in field["wells"]}
    todo = [r for r in reports if not args.wells or r["wellId"] in args.wells]
    jobs = [(r, wells[r["wellId"]], field["field"], field["seed"], args.out) for r in todo]
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        manifest = list(pool.map(_render_one, jobs, chunksize=8))
    out = Path(args.out)
    previous = json.loads((out / "manifest.json").read_text()) if (out / "manifest.json").exists() else []
    merged = {m["docId"]: m for m in previous} | {m["docId"]: m for m in manifest}
    (out / "manifest.json").write_text(json.dumps(sorted(merged.values(), key=lambda m: m["docId"]), indent=1) + "\n")
    scanned = sum(m["scanned"] for m in manifest)
    print(f"rendered {len(manifest)} reports, {sum(m['pages'] for m in manifest)} pages, {scanned} scanned, into {out}")


if __name__ == "__main__":
    main()
