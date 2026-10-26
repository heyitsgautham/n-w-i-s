from fastapi.testclient import TestClient
from wells_api.config import Settings, load
from wells_api.main import create_app


def _preflight(client: TestClient, origin: str):
    return client.options("/health", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})


def test_any_origin_is_allowed_by_default():
    client = TestClient(create_app(load({})))
    res = client.get("/health", headers={"Origin": "https://anywhere.example"})
    assert res.status_code == 200 and res.headers["access-control-allow-origin"] == "*"


def test_wells_cors_origins_limits_which_sites_may_call_the_api():
    settings = load({"WELLS_CORS_ORIGINS": " https://wells.example , http://localhost:3000 "})
    assert settings.cors_origins == ("https://wells.example", "http://localhost:3000")
    client = TestClient(create_app(settings))
    allowed = client.get("/health", headers={"Origin": "https://wells.example"})
    assert allowed.headers["access-control-allow-origin"] == "https://wells.example"
    assert allowed.headers["access-control-expose-headers"] == "X-Request-ID"
    assert (
        "access-control-allow-origin" not in client.get("/health", headers={"Origin": "https://evil.example"}).headers
    )
    assert _preflight(client, "http://localhost:3000").status_code == 200
    assert _preflight(client, "https://evil.example").status_code == 400


def test_each_app_reads_its_own_pack(tmp_path):
    missing = TestClient(create_app(Settings(data_dir=tmp_path)))
    assert missing.get("/health").status_code == 503
    assert TestClient(create_app(load({}))).get("/health").json()["wells"] == 25
