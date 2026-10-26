import pytest
import sentry_sdk
from fastapi.testclient import TestClient
from wells_api import errors, main
from wells_api.config import load

client = TestClient(main.app)


@pytest.fixture
def sent():
    """Starts a real Sentry client whose before_send keeps each event and drops it before the network."""
    events = []
    assert errors.init("https://key@o0.ingest.sentry.io/0", before_send=lambda event, hint: events.append(event))
    yield events
    sentry_sdk.get_client().close()
    sentry_sdk.get_global_scope().set_client(None)


def test_no_dsn_starts_nothing_and_reporting_is_a_no_op():
    assert load({}).sentry_dsn is None and load({"WELLS_SENTRY_DSN": ""}).sentry_dsn is None
    assert errors.init(None) is False and errors.init("") is False
    assert not sentry_sdk.get_client().is_active()
    errors.report(RuntimeError("nobody listening"), request_id="r1", method="GET", route="/replay")


def test_the_dsn_is_read_from_the_environment():
    dsn = "https://key@o0.ingest.sentry.io/0"
    assert load({"WELLS_SENTRY_DSN": dsn}).sentry_dsn == dsn


def test_an_unhandled_error_is_sent_once_with_the_request_id(sent, monkeypatch):
    def broken():
        raise RuntimeError("pack unreadable")

    monkeypatch.setattr(main, "store", broken)
    res = client.get("/replay", headers={"X-Request-ID": "web-err-1"})
    assert res.status_code == 500
    [event] = sent
    [exc] = event["exception"]["values"]
    assert (exc["type"], exc["value"]) == ("RuntimeError", "pack unreadable")
    assert event["tags"] == {"request_id": "web-err-1", "route": "/replay", "method": "GET"}


def test_a_handled_404_is_not_sent(sent):
    assert client.get("/wells/NOPE").status_code == 404
    assert sent == []
