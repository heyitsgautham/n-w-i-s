import json

from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from wells_api import main
from wells_api.limits import MAX_BODY_BYTES, BodyLimit

client = TestClient(main.app)


def _briefing_over_the_cap() -> bytes:
    line = {"text": "x" * 1999}
    body = {"title": "T", "sections": [{"title": "S", "lines": [line] * 200}] * 3}
    data = json.dumps(body).encode()
    assert len(data) > MAX_BODY_BYTES
    return data


def test_a_briefing_over_the_cap_is_refused_before_it_is_rendered(monkeypatch):
    rendered = []
    monkeypatch.setattr("wells_api.routes.briefing.briefing_pdf", lambda body: rendered.append(body) or b"%PDF")
    res = client.post(
        "/briefing/pdf",
        content=_briefing_over_the_cap(),
        headers={"Content-Type": "application/json", "Origin": "http://localhost:3000"},
    )
    assert res.status_code == 413
    assert res.json() == {"detail": f"request body over {MAX_BODY_BYTES} bytes"}
    assert rendered == []
    # The browser can read the 413, and the request is still logged under its id.
    assert res.headers["access-control-allow-origin"] == "*"
    assert len(res.headers["x-request-id"]) == 16


def test_a_chunked_body_is_cut_off_once_it_passes_the_cap():
    data = _briefing_over_the_cap()
    chunks = (data[i : i + 65536] for i in range(0, len(data), 65536))
    res = client.post("/briefing/pdf", content=chunks, headers={"Content-Type": "application/json"})
    assert res.status_code == 413


def _echo_app(max_bytes: int) -> TestClient:
    async def echo(request: Request) -> JSONResponse:
        return JSONResponse({"bytes": len(await request.body())})

    return TestClient(BodyLimit(Starlette(routes=[Route("/", echo, methods=["POST"])]), max_bytes=max_bytes))


def test_a_body_at_the_cap_passes_and_one_byte_more_does_not():
    small = _echo_app(10)
    assert small.post("/", content=b"0123456789").json() == {"bytes": 10}
    assert small.post("/", content=b"0123456789!").status_code == 413
    assert small.post("/", content=iter([b"01234", b"56789", b"!"])).status_code == 413
    assert small.post("/", content=iter([b"01234", b"56789"])).json() == {"bytes": 10}
