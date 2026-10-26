import io
import json
import time
from pathlib import Path

import pdfplumber
from wells_ddr.render import build_pdf, is_scanned, scan

DEMO = Path(__file__).resolve().parents[4] / "data" / "demo"
FIELD = json.loads((DEMO / "field.json").read_text())
REPORTS = json.loads((DEMO / "reports.json").read_text())
WELLS = {w["id"]: w for w in FIELD["wells"]}


def _report(event_id: str) -> dict:
    return next(r for r in REPORTS if any(i["eventId"] == event_id for i in r["incidents"]))


def test_report_carries_the_incident_and_the_synthetic_stamp():
    r = _report("KN-117-E04")
    pdf = build_pdf(r, WELLS[r["wellId"]], FIELD["field"], FIELD["seed"])
    with pdfplumber.open(io.BytesIO(pdf)) as doc:
        text = "\n".join(p.extract_text() for p in doc.pages)
    assert "INCIDENT KN-117-E04 | CAVING" in text
    assert "Depth: 3,047.5 m MD" in text
    assert "SYNTHETIC REPORT" in text and "Not Oil India data" in text


def test_scanned_pages_have_no_text_layer():
    r = REPORTS[0]
    pdf = scan(build_pdf(r, WELLS[r["wellId"]], FIELD["field"], FIELD["seed"]), r["id"])
    with pdfplumber.open(io.BytesIO(pdf)) as doc:
        assert all(not p.chars for p in doc.pages)


def test_about_one_report_in_five_is_scanned():
    share = sum(is_scanned(r["id"]) for r in REPORTS) / len(REPORTS)
    assert 0.15 < share < 0.25


def test_casing_sizes_print_without_missing_glyphs():
    r = next(r for r in REPORTS if any("13⅜" in op["text"] for op in r["ops"]))
    pdf = build_pdf(r, WELLS[r["wellId"]], FIELD["field"], FIELD["seed"])
    with pdfplumber.open(io.BytesIO(pdf)) as doc:
        text = "\n".join(p.extract_text() for p in doc.pages)
    assert "13 3/8 in casing" in text and "⅜" not in text


def test_the_same_report_renders_to_the_same_bytes_a_second_later():
    # reportlab stamps the wall clock into each PDF unless it runs invariant, so `make data` rewrote
    # every committed report even though nothing in it had changed.
    r = REPORTS[0]
    args = (r, WELLS[r["wellId"]], FIELD["field"], FIELD["seed"])
    first = build_pdf(*args)
    first_scan = scan(first, r["id"])
    time.sleep(1.1)
    assert build_pdf(*args) == first
    assert scan(build_pdf(*args), r["id"]) == first_scan
