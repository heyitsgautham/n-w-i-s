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
