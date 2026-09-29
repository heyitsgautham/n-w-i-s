import json
from pathlib import Path

from wells_ddr.render import build_pdf, scan
from wells_extract.incidents import lessons_from, parse_report
from wells_extract.pages import read_lines

DEMO = Path(__file__).resolve().parents[3] / "data" / "demo"
FIELD = json.loads((DEMO / "field.json").read_text())
REPORTS = json.loads((DEMO / "reports.json").read_text())
WELLS = {w["id"]: w for w in FIELD["wells"]}
TRUTH = {e["id"]: e for e in FIELD["events"]}


def _parse(event_id: str, scanned: bool, tmp_path: Path) -> dict:
    r = next(r for r in REPORTS if any(i["eventId"] == event_id for i in r["incidents"]))
    pdf = build_pdf(r, WELLS[r["wellId"]], FIELD["field"], FIELD["seed"])
    if scanned:
        pdf = scan(pdf, "clean-scan")
    path = tmp_path / f"{r['id']}.pdf"
    path.write_bytes(pdf)
    events = parse_report(read_lines(path), r["id"])
    return next(e for e in events if e["id"] == event_id)


def test_text_layer_reads_the_hero_incident_exactly(tmp_path):
    e = _parse("KN-117-E04", scanned=False, tmp_path=tmp_path)
    t = TRUTH["KN-117-E04"]
    assert (e["kind"], e["md"], e["mudWeightPpg"], e["nptHours"]) == (
        t["kind"],
        t["md"],
        t["mudWeightPpg"],
        t["nptHours"],
    )
    assert e["title"] == "Coal-shale caving, pack-off"
    assert e["confidence"] >= 0.95 and not e["needsReview"]
    assert [lesson["kind"] for lesson in e["lessons"]] == ["raise-mud-weight", "wiper-trip"]
    assert e["source"]["page"] == 1 and len(e["source"]["bbox"]) == 4


def test_ocr_reads_a_clean_scan(tmp_path):
    e = _parse("KN-109-E06", scanned=True, tmp_path=tmp_path)
    assert e["source"]["ocr"] is True
    assert e["md"] == TRUTH["KN-109-E06"]["md"]
    assert 0.5 < e["confidence"] < 0.99


def test_lessons_keep_their_evidence_sentence():
    got = lessons_from("Stuck after 40 min static for a survey. Keep the string static under 10 min in the coal-shale.")
    assert got == [{"kind": "limit-static-time", "minutes": 10, "evidence": "Stuck after 40 min static for a survey."}]


def test_committed_extraction_recovers_the_hero_events():
    extracted = {e["id"]: e for e in json.loads((DEMO / "extracted" / "events.json").read_text())}
    for eid in ("KN-117-E04", "KN-109-E06", "KN-104-E07"):
        assert extracted[eid]["md"] == TRUTH[eid]["md"]
        assert not extracted[eid]["needsReview"]


def test_each_lesson_cites_its_own_sentence(tmp_path):
    e = _parse("KN-117-E04", scanned=False, tmp_path=tmp_path)
    mud = next(lesson for lesson in e["lessons"] if lesson["kind"] == "raise-mud-weight")
    assert mud["evidence"] == "Caved at 9.8 ppg, hole stable at 10.4 ppg."
    assert mud["source"]["page"] == e["source"]["page"]
    [rect] = mud["source"]["rects"]
    block = e["source"]["bbox"]
    assert block[0] <= rect[0] < rect[2] <= block[2] and block[1] <= rect[1] < rect[3] <= block[3]
