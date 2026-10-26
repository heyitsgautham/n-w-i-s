import json
import logging
import sys

import pytest
from fastapi.testclient import TestClient
from wells_api import main
from wells_api.logs import JsonFormatter, configure

client = TestClient(main.app)


def _request_records(caplog):
    return [r for r in caplog.records if r.name == "wells_api" and r.getMessage() == "request"]


def test_every_response_carries_a_request_id_and_is_logged(caplog):
    with caplog.at_level(logging.INFO, logger="wells_api"):
        res = client.get("/wells/KN-117")
    rid = res.headers["X-Request-ID"]
    assert len(rid) == 16
    [record] = _request_records(caplog)
    assert (record.request_id, record.method, record.path, record.status) == (rid, "GET", "/wells/KN-117", 200)
    assert record.duration_ms >= 0


def test_a_callers_request_id_is_kept(caplog):
    with caplog.at_level(logging.INFO, logger="wells_api"):
        res = client.get("/wells/NOPE", headers={"X-Request-ID": "web-abc123"})
    assert res.status_code == 404 and res.headers["X-Request-ID"] == "web-abc123"
    assert _request_records(caplog)[0].status == 404


def test_an_unhandled_error_is_logged_and_answered_as_json(caplog, broken_store):
    with caplog.at_level(logging.INFO, logger="wells_api"):
        res = client.get("/replay")
    assert res.status_code == 500
    assert res.json() == {"detail": "internal error", "requestId": res.headers["X-Request-ID"]}
    error = next(r for r in caplog.records if r.getMessage() == "unhandled error")
    assert error.exc_info and error.path == "/replay"


def test_formatter_writes_one_json_object_with_the_extra_fields():
    record = logging.LogRecord("wells_api", logging.WARNING, __file__, 1, "slow page %s", ("p1",), None)
    record.request_id = "r1"
    line = JsonFormatter().format(record)
    body = json.loads(line)
    assert body["level"] == "warning" and body["msg"] == "slow page p1" and body["request_id"] == "r1"
    assert body["ts"].endswith("Z") and "\n" not in line


def test_formatter_includes_the_traceback():
    try:
        raise ValueError("bad page")
    except ValueError:
        record = logging.LogRecord("wells_api", logging.ERROR, __file__, 1, "failed", None, sys.exc_info())
    assert "ValueError: bad page" in json.loads(JsonFormatter().format(record))["exc"]


@pytest.mark.parametrize("level", ["debug", "WARNING"])
def test_configure_reads_the_level_and_adds_one_handler(level):
    logger = configure(level)
    configure(level)
    assert logger.level == logging.getLevelName(level.upper())
    assert sum(isinstance(h.formatter, JsonFormatter) for h in logger.handlers) == 1
    configure("INFO")
