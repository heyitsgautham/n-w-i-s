"""Error tracking. Unhandled errors go to Sentry when WELLS_SENTRY_DSN is set, and nowhere else otherwise.

Sentry's automatic integrations stay off.
The request middleware already catches every unhandled error, logs it and answers 500, so it reports the
error itself, tagged with the request id the caller got back. The automatic FastAPI and logging hooks would
send the same error a second time.
"""

from __future__ import annotations

from typing import Any

import sentry_sdk


def init(dsn: str | None, **options: Any) -> bool:
    """Starts the Sentry client when `dsn` is set. Returns whether errors will be sent."""
    if not dsn:
        return False
    sentry_sdk.init(
        dsn=dsn,
        default_integrations=False,
        auto_enabling_integrations=False,
        traces_sample_rate=0.0,
        **options,
    )
    return True


def report(exc: BaseException, *, request_id: str, method: str, route: str) -> None:
    """Sends `exc` with the request's id and route. Without a started client this does nothing."""
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("request_id", request_id)
        scope.set_tag("route", route)
        scope.set_tag("method", method)
        sentry_sdk.capture_exception(exc)
