from fastapi.testclient import TestClient
from wells_api.main import app

client = TestClient(app)


def test_health_counts_the_pack():
    body = client.get("/health").json()
    assert body["ok"] and body["wells"] == 25


def test_search_reads_the_question_into_filters():
    body = client.get("/search", params={"q": "losses in Tipam within 5 km since 2015"}).json()
    assert {(f["key"], f["value"]) for f in body["filters"]} == {
        ("kind", "losses"),
        ("formation", "TPM"),
        ("radius", 5.0),
        ("yearFrom", 2015),
    }
    assert body["count"] == 4
    for r in body["results"]:
        assert r["formationId"] == "TPM" and r["distanceKm"] <= 5 and r["date"] >= "2015"
        assert r["source"]["page"] >= 1 and r["lossRateBblH"] > 0


def test_review_confirms_and_resets():
    queue = client.get("/review").json()
    assert queue, "the demo pack should have something to review"
    target = queue[0]["id"]
    assert client.post(f"/review/{target}", json={"decision": "confirm"}).json()["decision"] == "confirm"
    assert client.get("/review/decisions").json() == {target: "confirm"}
    assert client.post("/review/reset").json() == {"ok": True}
    assert client.get("/review/decisions").json() == {}


def test_page_image_renders():
    doc = client.get("/events", params={"well": "KN-117"}).json()[0]["source"]["docId"]
    res = client.get(f"/documents/{doc}/pages/1.png", params={"scale": 1})
    assert res.status_code == 200 and res.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_briefing_exports_to_pdf():
    body = {
        "title": "Offset review",
        "sections": [
            {"title": "12¼ in", "lines": [{"text": "Raise mud weight.", "cites": ["KN-117 DDR 3 Feb 2018 p.1"]}]}
        ],
    }
    made = client.post("/briefing/pdf", json=body).json()
    assert made["pages"] == 1
    assert client.get(made["url"]).content[:4] == b"%PDF"


def test_page_words_are_the_ocr_boxes_of_a_scanned_page():
    words = client.get("/documents/KN-117-2018-02-03/pages/1/words").json()
    assert words["ocr"] is True
    text = " ".join(w[0] for line in words["lines"] for w in line["words"])
    assert "Caved at 9.8 ppg, hole stable at 10.4 ppg." in text
    x0, top, x1, bottom = words["lines"][0]["words"][0][1:]
    assert 0 <= x0 < x1 <= 595.3 and 0 <= top < bottom <= 841.9


def test_page_words_outside_the_document_are_not_found():
    doc = "KN-117-2018-02-03"
    pages = client.get(f"/documents/{doc}").json()["pages"]
    assert client.get(f"/documents/{doc}/pages/{pages + 1}/words").status_code == 404
    assert client.get(f"/documents/{doc}/pages/0/words").status_code == 422


def test_page_numbers_start_at_one_on_every_page_route():
    assert client.get("/documents/KN-117-2018-02-03/pages/0.png").status_code == 422
    assert client.get("/briefing/anything/pages/0.png").status_code == 422


def test_search_rejects_a_question_too_long_to_be_one():
    assert client.get("/search", params={"q": "losses " * 40}).status_code == 422
