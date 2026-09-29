"""Turns a PDF page into lines of text with boxes and confidence, from the text layer or by OCR."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import pdfplumber
import pytesseract

OCR_DPI = 200
#: Text-layer lines are exact, but the parse can still go wrong, so they never claim certainty.
TEXT_LAYER_CONF = 0.99


@dataclass
class Line:
    page: int
    text: str
    #: PDF points from the page's top-left: x0, top, x1, bottom.
    bbox: tuple[float, float, float, float]
    conf: float
    ocr: bool
    #: Each word with its box, so a single sentence can be cited, not just the line.
    words: list[tuple[str, float, float, float, float]] = field(default_factory=list)


def _group(words: list[dict], page: int, ocr: bool, tolerance: float = 2.8) -> list[Line]:
    """Groups words into lines by vertical position, then orders each line left to right."""
    words = sorted(words, key=lambda w: (round(w["top"], 1), w["x0"]))
    lines: list[list[dict]] = []
    for w in words:
        if lines and abs(lines[-1][0]["top"] - w["top"]) <= tolerance:
            lines[-1].append(w)
        else:
            lines.append([w])
    out = []
    for ws in lines:
        ws.sort(key=lambda w: w["x0"])
        conf = sum(w["conf"] for w in ws) / len(ws)
        bbox = (
            min(w["x0"] for w in ws),
            min(w["top"] for w in ws),
            max(w["x1"] for w in ws),
            max(w["bottom"] for w in ws),
        )
        out.append(
            Line(
                page=page,
                text=" ".join(w["text"] for w in ws),
                bbox=bbox,
                conf=round(conf, 4),
                ocr=ocr,
                words=[(w["text"], w["x0"], w["top"], w["x1"], w["bottom"]) for w in ws],
            )
        )
    return out


def _ocr_words(page: pdfplumber.page.Page, cache: Path | None) -> list[dict]:
    img = page.to_image(resolution=OCR_DPI).original.convert("L")
    key = hashlib.sha1(img.tobytes()).hexdigest()
    hit = cache / f"{key}.json" if cache else None
    if hit and hit.exists():
        return json.loads(hit.read_text())
    data = pytesseract.image_to_data(img, config="--psm 3", output_type=pytesseract.Output.DICT)
    scale = 72 / OCR_DPI
    words = []
    for i, text in enumerate(data["text"]):
        conf = float(data["conf"][i])
        if not text.strip() or conf < 0:
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        words.append(
            {
                "text": text,
                "x0": x * scale,
                "top": y * scale,
                "x1": (x + w) * scale,
                "bottom": (y + h) * scale,
                "conf": conf / 100,
            }
        )
    if hit:
        hit.parent.mkdir(parents=True, exist_ok=True)
        hit.write_text(json.dumps(words))
    return words


def read_lines(path: Path, cache: Path | None = None) -> list[Line]:
    """Every line of a report. Pages without a text layer go through Tesseract."""
    out: list[Line] = []
    with pdfplumber.open(path) as pdf:
        for n, page in enumerate(pdf.pages, start=1):
            if page.chars:
                words = [
                    {**w, "conf": TEXT_LAYER_CONF}
                    for w in page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
                ]
                out += _group(words, n, ocr=False)
            else:
                out += _group(_ocr_words(page, cache), n, ocr=True, tolerance=4)
    return out


def line_dict(line: Line) -> dict:
    d = asdict(line)
    d.pop("words")
    d["bbox"] = [round(v, 1) for v in line.bbox]
    return d
