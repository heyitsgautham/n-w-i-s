"""A cap on request bodies, enforced before a route reads one.

The only routes that take a body are the review decision and the briefing export, and a real briefing is a
few kilobytes. Without the cap, a 38 MB body was read whole, parsed, rendered into a PDF for 15 seconds and
kept in memory.
"""

from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

#: 1 MiB, a few hundred times a real briefing.
MAX_BODY_BYTES = 1024 * 1024


class BodyLimit:
    """Answers 413 to a request whose body is over `max_bytes`.

    A declared Content-Length over the cap is refused before any of the body is read.
    A chunked body is counted as it arrives and refused as soon as it passes the cap.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        length = dict(scope["headers"]).get(b"content-length")
        if length is not None and length.isdigit() and int(length) > self.max_bytes:
            await self._refuse(send)
            return

        seen = 0
        started = False
        refused = False

        async def counted() -> Message:
            # Past the cap, answer 413 here and tell the app the client has gone, so it stops reading.
            nonlocal seen, refused
            if refused:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > self.max_bytes and not started:
                    refused = True
                    await self._refuse(send)
                    return {"type": "http.disconnect"}
            return message

        async def guarded(message: Message) -> None:
            # Once the 413 is out, whatever the app answers to the disconnect is dropped.
            nonlocal started
            if refused:
                return
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, counted, guarded)
        except Exception:
            if not refused:
                raise

    async def _refuse(self, send: Send) -> None:
        body = json.dumps({"detail": f"request body over {self.max_bytes} bytes"}).encode()
        headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]
        await send({"type": "http.response.start", "status": 413, "headers": headers})
        await send({"type": "http.response.body", "body": body})
