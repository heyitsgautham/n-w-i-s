"""API over the demo pack and the parsed reports.

Run with `uv run uvicorn wells_api.main:app --port 8121`. Everything it serves comes from
data/demo: field.json from the generator, and extracted/ from the parser run over the rendered PDFs.

This module builds the app: settings, logging, metrics, error tracking and the request middleware.
The routes live in wells_api.routes, one module per area, and reach the pack through store.StoreDep.
"""

from __future__ import annotations

import time
import uuid
from importlib.metadata import version

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from . import config, errors, logs, metrics
from .limits import BodyLimit
from .routes import briefing, documents, review, wells
from .schemas import Health
from .store import PackMissing, StoreDep

log = logs.configure()


def create_app(settings: config.Settings) -> FastAPI:
    """The API for one set of settings. `app` below is built from the environment; tests build their own."""
    app = FastAPI(title="Offset-well memory API", version=version("wells-api"), description="Synthetic demo pack")
    app.state.data_dir = settings.data_dir
    logs.configure(settings.log_level)
    errors.init(settings.sentry_dsn, release=f"wells-api@{app.version}")
    # Starlette runs the last middleware added first: request_log, then CORS, then the body cap.
    # CORS wraps the cap, so a browser can read a 413 instead of seeing a CORS failure.
    app.add_middleware(BodyLimit)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )
    app.middleware("http")(request_log)
    app.add_exception_handler(PackMissing, pack_missing)
    app.add_api_route("/health", health, methods=["GET"])
    app.add_api_route("/metrics", prometheus_metrics, methods=["GET"], include_in_schema=False)
    for module in (wells, documents, review, briefing):
        app.include_router(module.router)
    return app


async def request_log(request: Request, call_next):
    """Logs every request as one JSON line, counts it in /metrics, and returns its id in X-Request-ID.

    A caller's own X-Request-ID is kept, so a request can be traced from the web server through the API.
    An unhandled error is logged with its traceback, sent to Sentry when WELLS_SENTRY_DSN is set, and answered
    as JSON carrying the same id.
    """
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    start = time.perf_counter()
    failed = False
    try:
        response = await call_next(request)
    except Exception as exc:
        failed = True
        log.exception("unhandled error", extra={"request_id": rid, "method": request.method, "path": request.url.path})
        errors.report(exc, request_id=rid, method=request.method, route=metrics.route_of(request))
        response = JSONResponse({"detail": "internal error", "requestId": rid}, status_code=500)
    response.headers["X-Request-ID"] = rid
    metrics.observe(request, response.status_code, time.perf_counter() - start, failed=failed)
    log.info(
        "request",
        extra={
            "request_id": rid,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round((time.perf_counter() - start) * 1000, 1),
        },
    )
    return response


def pack_missing(request: Request, exc: Exception) -> JSONResponse:
    """Registered for PackMissing: the pack is not there, so every route answers 503 with the fix."""
    log.error("demo pack missing", extra={"path": request.url.path, "detail": str(exc)})
    return JSONResponse({"detail": str(exc)}, status_code=503)


def health(s: StoreDep) -> Health:
    return Health(ok=True, seed=s.field["seed"], wells=len(s.wells), events=len(s.events), documents=len(s.documents))


def prometheus_metrics() -> Response:
    """Request counts, latencies and unhandled errors by route, for a Prometheus scrape."""
    return metrics.exposition()


app = create_app(config.load())
