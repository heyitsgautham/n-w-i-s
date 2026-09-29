"""Finds incident blocks in a report's lines and turns them into events with citations."""

from __future__ import annotations

import re
from dataclasses import dataclass

from .pages import Line

#: Below this an event goes to the review queue and cannot raise an alert until a person confirms it.
REVIEW_THRESHOLD = 0.85

KINDS = {
    "CAVING": "caving",
    "STUCK PIPE": "stuck-pipe",
    "LOSSES": "losses",
    "TIGHT HOLE": "tight-hole",
    "BIT BALLING": "bit-balling",
    "DIFFERENTIAL STICKING": "differential-sticking",
    "KICK": "kick",
}

#: When the type label is unreadable, the description usually says what happened.
KEYWORDS = [
    ("differential-sticking", r"differential"),
    ("stuck-pipe", r"\bstuck\b|could not pick up"),
    ("caving", r"caving|cavings|pack(ed)? off"),
    ("losses", r"\blosses\b|lost returns"),
    ("kick", r"\bkick\b|pit gain|influx"),
    ("tight-hole", r"overpull|tight"),
    ("bit-balling", r"balled|balling"),
]

HEADING = re.compile(r"INCIDENT\s+([A-Z0-9O]{2}-[0-9O]{3}-[EB][0-9O]{2})\s*[|lI!/]?\s*([A-Z ]+)$")
SECTION_END = re.compile(r"^(MUD PROPERTIES|BIT RECORD|SURVEYS|INCIDENT\s)")
HEADER_DEPTH = re.compile(r"Depth 00:00\s+([\d,]+\.\d)\s*m MD.*Depth 24:00\s+([\d,]+\.\d)\s*m MD")


def _num(s: str | None) -> float | None:
    if s is None:
        return None
    try:
        return float(s.replace(",", "").replace("O", "0"))
    except ValueError:
        return None


def _between(text: str, start: str, end: str | None) -> str | None:
    pattern = re.escape(start) + r"\s*(.+?)\s*" + (re.escape(end) if end else r"$")
    m = re.search(pattern, text, re.S)
    return m.group(1).strip() if m else None


@dataclass
class Block:
    heading: Line
    lines: list[Line]


def blocks(lines: list[Line]) -> list[Block]:
    out: list[Block] = []
    current: Block | None = None
    for line in lines:
        if HEADING.search(line.text):
            current = Block(heading=line, lines=[line])
            out.append(current)
        elif current and SECTION_END.match(line.text):
            current = None
        elif current:
            current.lines.append(line)
    return out


def lessons_from(remarks: str) -> list[dict]:
    """Reads what the remarks tell the next well to do, keeping the sentence as the evidence."""
    sentences = [s.strip() for s in re.split(r"(?<=\.)\s+", remarks) if s.strip()]
    out: list[dict] = []
    for i, s in enumerate(sentences):
        if m := re.search(r"stable at (\d+\.\d) ppg", s):
            out.append({"kind": "raise-mud-weight", "toPpg": float(m.group(1)), "evidence": s})
        if re.search(r"wiper trip", s, re.I):
            out.append({"kind": "wiper-trip", "evidence": s})
        if m := re.search(r"static under (\d+) min", s):
            prior = sentences[i - 1] if i > 0 and "static" in sentences[i - 1] else s
            out.append({"kind": "limit-static-time", "minutes": int(m.group(1)), "evidence": prior})
    return out


def _norm(token: str) -> str:
    return token.strip(".,;:\"'()").lower()


def sentence_rects(block: Block, sentence: str) -> dict | None:
    """Finds a sentence in the block's words and returns its box on each line it spans."""
    words = [(w, line) for line in block.lines for w in line.words]
    target = [_norm(t) for t in sentence.split()]
    n = len(target)
    for i in range(len(words) - n + 1):
        if all(_norm(words[i + k][0][0]) == target[k] for k in range(n)):
            run = words[i : i + n]
            rects: list[list[float]] = []
            lines: list[Line] = []
            for _, ln in run:
                if not any(ln is seen for seen in lines):
                    lines.append(ln)
            for line in lines:
                ws = [w for w, ln in run if ln is line]
                rects.append(
                    [
                        round(min(w[1] for w in ws), 1),
                        round(min(w[2] for w in ws), 1),
                        round(max(w[3] for w in ws), 1),
                        round(max(w[4] for w in ws), 1),
                    ]
                )
            return {"page": run[0][1].page, "rects": rects}
    return None


def parse_block(block: Block, doc_id: str, well_id: str, date: str, depth_range: tuple[float, float] | None) -> dict:
    text = " ".join(line.text for line in block.lines)
    head = HEADING.search(block.heading.text)
    assert head
    event_id = head.group(1).replace("O", "0").replace("K0", "KN")
    label = head.group(2).strip()
    kind = KINDS.get(label)
    kind_conf = block.heading.conf
    if kind is None:
        desc = _between(text, "Description:", "Action:") or text
        kind = next((k for k, pat in KEYWORDS if re.search(pat, desc, re.I)), "tight-hole")
        kind_conf *= 0.6

    title = _between(text, "Title:", "Start:")
    time = re.search(r"Start:\s*(\d{1,2}:\d{2})", text)
    depth = _num(m.group(1)) if (m := re.search(r"Depth:\s*([\d,O]+\.\d)\s*m\s*MD", text)) else None
    mw = _num(m.group(1)) if (m := re.search(r"MW:\s*(\d+\.\d)\s*ppg", text)) else None
    npt = _num(m.group(1)) if (m := re.search(r"NPT:\s*(\d+\.\d)\s*h", text)) else None
    description = _between(text, "Description:", "Action:") or ""
    action = _between(text, "Action:", "Remarks:") or ""
    remarks = _between(text, "Remarks:", None) or ""
    loss = re.search(r"(\d+)\s*bbl/h", description)

    field_line = next((line for line in block.lines if "Depth:" in line.text), block.heading)
    fields = {
        "kind": kind_conf,
        "title": next((line.conf for line in block.lines if line.text.startswith("Title:")), 0.0) if title else 0.0,
        "depth": field_line.conf if depth is not None else 0.0,
        "mudWeight": field_line.conf if mw is not None else 0.0,
        "npt": field_line.conf if npt is not None else 0.0,
    }
    # A depth outside the day's drilled interval is a misread, however confident the OCR felt.
    if depth is not None and depth_range and not (depth_range[0] - 1 <= depth <= depth_range[1] + 1):
        fields["depth"] *= 0.5
    confidence = round(min(fields.values()), 3)

    first_page = block.heading.page
    on_page = [line for line in block.lines if line.page == first_page]
    bbox = [
        round(min(line.bbox[0] for line in on_page), 1),
        round(min(line.bbox[1] for line in on_page), 1),
        round(max(line.bbox[2] for line in on_page), 1),
        round(max(line.bbox[3] for line in on_page), 1),
    ]
    event = {
        "id": event_id,
        "wellId": well_id,
        "kind": kind,
        "title": title or label.title(),
        "md": depth,
        "date": date,
        "time": time.group(1) if time else None,
        "mudWeightPpg": mw,
        "nptHours": npt,
        "narrative": description,
        "action": action,
        "remarks": remarks,
        "lessons": [
            {**lesson, **({"source": src} if (src := sentence_rects(block, lesson["evidence"])) else {})}
            for lesson in lessons_from(remarks)
        ],
        "source": {"docId": doc_id, "page": first_page, "bbox": bbox, "ocr": block.heading.ocr},
        "confidence": confidence,
        "fieldConfidence": {k: round(v, 3) for k, v in fields.items()},
        "needsReview": confidence < REVIEW_THRESHOLD or depth is None,
    }
    if loss:
        event["lossRateBblH"] = float(loss.group(1))
    return event


def parse_report(lines: list[Line], doc_id: str) -> list[dict]:
    well_id = "-".join(doc_id.split("-")[:2])
    date = "-".join(doc_id.split("-")[2:])
    header = " ".join(line.text for line in lines if line.page == 1)[:1200]
    m = HEADER_DEPTH.search(header)
    depth_range = (_num(m.group(1)), _num(m.group(2))) if m else None
    return [parse_block(b, doc_id, well_id, date, depth_range) for b in blocks(lines)]
