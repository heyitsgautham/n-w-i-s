from fastapi.testclient import TestClient
from wells_api import main

client = TestClient(main.app)
spec = client.get("/openapi.json").json()


def _response_schema(path: str, method: str = "get") -> dict:
    return spec["paths"][path][method]["responses"]["200"]["content"]["application/json"]["schema"]


def test_fixed_shape_routes_document_their_response_models():
    assert _response_schema("/health") == {"$ref": "#/components/schemas/Health"}
    assert _response_schema("/review/{event_id}", "post") == {"$ref": "#/components/schemas/Decided"}
    assert _response_schema("/review/reset", "post") == {"$ref": "#/components/schemas/Reset"}
    assert _response_schema("/briefing/pdf", "post") == {"$ref": "#/components/schemas/BriefingExport"}
    decisions = _response_schema("/review/decisions")["additionalProperties"]
    assert decisions["enum"] == ["confirm", "reject"]


def test_health_answers_the_same_body_as_before():
    body = client.get("/health").json()
    assert list(body) == ["ok", "seed", "wells", "events", "documents"]
    assert body == {"ok": True, "seed": 26121, "wells": 25, "events": 118, "documents": 926}


def test_a_decision_and_a_reset_answer_exactly_their_models():
    target = client.get("/review").json()[0]["id"]
    assert client.post(f"/review/{target}", json={"decision": "reject"}).json() == {"id": target, "decision": "reject"}
    assert client.get("/review/decisions").json() == {target: "reject"}
    assert client.post("/review/reset").json() == {"ok": True}


def test_a_briefing_export_answers_its_key_size_and_url():
    briefing = {"title": "T", "sections": [{"title": "S", "lines": [{"text": "One line."}]}]}
    body = client.post("/briefing/pdf", json=briefing).json()
    assert list(body) == ["id", "pages", "bytes", "url"]
    assert body["pages"] == 1 and body["bytes"] > 0 and body["url"] == f"/briefing/{body['id']}.pdf"
