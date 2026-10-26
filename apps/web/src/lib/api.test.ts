import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, fetchJson } from "./api";
import { PageWords } from "./schemas";

function answer(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
  );
}

describe("fetchJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a body that matches the schema", async () => {
    answer(200, { ocr: true, lines: [{ conf: 0.91, words: [["Losses", 50, 320, 90, 330]] }] });
    const words = await fetchJson("http://api/documents/D/pages/1/words", PageWords);
    expect(words.lines[0].words[0][0]).toBe("Losses");
  });

  // Before the check, the drawer took this 404 body as page words and crashed reading `lines`.
  it("rejects an error status with the API's own detail", async () => {
    answer(404, { detail: "no rendered document KN-107-2013-06-04" });
    const err = await fetchJson("http://api/documents/KN-107-2013-06-04/pages/1/words", PageWords).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, message: "API 404: no rendered document KN-107-2013-06-04" });
  });

  it("rejects an error status whose detail is not text", async () => {
    answer(422, { detail: [{ msg: "too short" }] });
    await expect(fetchJson("http://api/search?q=x", z.object({}))).rejects.toThrow(/^API 422$/);
  });

  it("rejects a 200 body of the wrong shape, naming where it differs", async () => {
    answer(200, { ocr: true, lines: [{ conf: "high", words: [] }] });
    await expect(fetchJson("http://api/documents/D/pages/1/words", PageWords)).rejects.toThrow(
      /^unexpected response from \/documents\/D\/pages\/1\/words at lines\.0\.conf: /,
    );
  });

  it("rejects a body that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>bad gateway</html>", { status: 200 })),
    );
    await expect(fetchJson("http://api/health", z.object({ ok: z.boolean() }))).rejects.toThrow(/unexpected response from \/health/);
  });

  it("passes the request options through", async () => {
    answer(200, {});
    await fetchJson("http://api/briefing/pdf", z.object({}), { method: "POST" });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("http://api/briefing/pdf", { method: "POST" });
  });
});
