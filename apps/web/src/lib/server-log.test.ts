import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError, requestErrorLine } from "./server-log";

const request = { path: "/section", method: "GET", headers: { "x-request-id": "web-abc123", accept: "text/html" } };
const context = { routerKind: "App Router", routePath: "/(console)/section", routeType: "render", revalidateReason: undefined } as const;

describe("requestErrorLine", () => {
  it("writes one JSON object in the API's log shape", () => {
    const err = Object.assign(new Error("no data/demo/field.json above /app; run `make data`"), { digest: "562586540" });
    const line = requestErrorLine(err, request, context, new Date("2026-10-27T00:00:00Z"));
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toMatchObject({
      ts: "2026-10-27T00:00:00.000Z",
      level: "error",
      logger: "wells_web",
      msg: "request error",
      method: "GET",
      path: "/section",
      route: "/(console)/section",
      route_type: "render",
      request_id: "web-abc123",
      digest: "562586540",
      error: "Error: no data/demo/field.json above /app; run `make data`",
    });
    expect(JSON.parse(line).exc).toContain("server-log.test.ts");
  });

  it("copes with a thrown non-error and a request without an id", () => {
    const body = JSON.parse(requestErrorLine("pack unreadable", { ...request, headers: {} }, context));
    expect(body).toMatchObject({ error: "Error: pack unreadable", request_id: null, digest: null });
  });

  it("takes the first id when the header repeats", () => {
    const body = JSON.parse(requestErrorLine(new Error("x"), { ...request, headers: { "x-request-id": ["a", "b"] } }, context));
    expect(body.request_id).toBe("a");
  });
});

describe("onRequestError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the line to stderr through console.error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await onRequestError(new TypeError("boom"), request, context);
    expect(spy).toHaveBeenCalledOnce();
    expect(JSON.parse(spy.mock.calls[0]![0] as string).error).toBe("TypeError: boom");
  });
});
