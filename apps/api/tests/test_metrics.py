from fastapi.testclient import TestClient
from prometheus_client.parser import text_string_to_metric_families
from wells_api import main, metrics

client = TestClient(main.app)


def _sample(name: str, **labels: str) -> float:
    return metrics.REGISTRY.get_sample_value(name, labels) or 0.0


def test_requests_are_counted_by_route_template_not_raw_path():
    before = _sample("wells_api_requests_total", method="GET", route="/wells/{well_id}", status="200")
    client.get("/wells/KN-117")
    client.get("/wells/KN-101")
    after = _sample("wells_api_requests_total", method="GET", route="/wells/{well_id}", status="200")
    assert after - before == 2
    assert _sample("wells_api_requests_total", method="GET", route="/wells/KN-117", status="200") == 0


def test_a_404_from_a_route_and_an_unmatched_path_are_told_apart():
    route_404 = _sample("wells_api_requests_total", method="GET", route="/wells/{well_id}", status="404")
    unmatched = _sample("wells_api_requests_total", method="GET", route="unmatched", status="404")
    client.get("/wells/NOPE")
    client.get("/no/such/route")
    assert _sample("wells_api_requests_total", method="GET", route="/wells/{well_id}", status="404") == route_404 + 1
    assert _sample("wells_api_requests_total", method="GET", route="unmatched", status="404") == unmatched + 1


def test_latency_is_observed_per_route():
    count = _sample("wells_api_request_duration_seconds_count", method="GET", route="/health")
    client.get("/health")
    assert _sample("wells_api_request_duration_seconds_count", method="GET", route="/health") == count + 1


def test_an_unhandled_error_is_counted(broken_store):
    before = _sample("wells_api_unhandled_errors_total", route="/replay")
    assert client.get("/replay").status_code == 500
    assert _sample("wells_api_unhandled_errors_total", route="/replay") == before + 1
    assert _sample("wells_api_requests_total", method="GET", route="/replay", status="500") >= 1


def test_metrics_endpoint_serves_the_prometheus_text_format():
    client.get("/health")
    res = client.get("/metrics")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/plain")
    families = {f.name for f in text_string_to_metric_families(res.text)}
    assert {"wells_api_requests", "wells_api_request_duration_seconds", "wells_api_unhandled_errors"} <= families
