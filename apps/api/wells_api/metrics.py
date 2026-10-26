"""Prometheus metrics for the API, served at GET /metrics.

Requests are labelled by route template, `/documents/{doc_id}`, never by the raw path, so 926 report ids
add one series, not 926. A path no route matched is labelled `unmatched`.
"""

from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest
from starlette.requests import Request
from starlette.responses import Response

#: The API's own registry, so a test or a second app in one process starts from known counts.
REGISTRY = CollectorRegistry()

REQUESTS = Counter(
    "wells_api_requests_total",
    "Requests answered, by route and status.",
    ["method", "route", "status"],
    registry=REGISTRY,
)
LATENCY = Histogram(
    "wells_api_request_duration_seconds",
    "Time to answer a request, by route.",
    ["method", "route"],
    # Page renders and briefing exports take up to a few seconds, everything else answers in milliseconds.
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
    registry=REGISTRY,
)
ERRORS = Counter(
    "wells_api_unhandled_errors_total", "Requests that raised and were answered 500.", ["route"], registry=REGISTRY
)


def route_of(request: Request) -> str:
    """The template of the route that handled `request`, which the router sets once it has matched."""
    return getattr(request.scope.get("route"), "path", "unmatched")


def observe(request: Request, status: int, seconds: float, *, failed: bool = False) -> None:
    route = route_of(request)
    REQUESTS.labels(request.method, route, str(status)).inc()
    LATENCY.labels(request.method, route).observe(seconds)
    if failed:
        ERRORS.labels(route).inc()


def exposition() -> Response:
    """Every metric in the Prometheus text format."""
    return Response(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)
