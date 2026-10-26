"""JSON logs, one object per line, so a request can be followed by its id across the API's output."""

from __future__ import annotations

import json
import logging
import time

#: Attributes every LogRecord carries. Anything else on a record came from `extra=` and is logged as a field.
_STANDARD = set(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {"message", "asctime", "taskName"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        out.update({k: v for k, v in vars(record).items() if k not in _STANDARD})
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


def configure(level: str = "INFO") -> logging.Logger:
    """Sends the `wells_api` logger to stderr as JSON at `level`, which the app reads from WELLS_LOG_LEVEL."""
    logger = logging.getLogger("wells_api")
    logger.setLevel(level.upper())
    if not any(isinstance(h.formatter, JsonFormatter) for h in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    return logger
