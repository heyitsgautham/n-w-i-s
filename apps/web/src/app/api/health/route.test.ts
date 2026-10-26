import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

async function health() {
  const { GET } = await import("./route");
  const res = await GET();
  return { status: res.status, body: await res.json() };
}

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("answers 200 with the pack's well count when the API is up", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await health()).toEqual({ status: 200, body: { ok: true, pack: { wells: 25 }, api: true } });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8121/health", expect.objectContaining({ cache: "no-store" }));
  });

  it("still answers 200 when the API is down, and says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    expect(await health()).toEqual({ status: 200, body: { ok: true, pack: { wells: 25 }, api: false } });
  });

  it("answers 503 naming the missing file when there is no pack", async () => {
    const empty = mkdtempSync(path.join(tmpdir(), "no-pack-"));
    vi.stubEnv("WELLS_DATA_DIR", empty);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.pack.error).toContain(path.join(empty, "field.json"));
    expect(body.api).toBe(false);
  });

  // The pack used to be looked up when lib/data.ts was imported, so every route failed to load at all.
  it("answers 503 when no data/demo sits above the working directory", async () => {
    vi.stubEnv("WELLS_DATA_DIR", "");
    vi.spyOn(process, "cwd").mockReturnValue(path.parse(process.cwd()).root);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    const { status, body } = await health();
    expect(status).toBe(503);
    expect(body.pack.error).toMatch(/^no data\/demo\/field.json above \/; run `make data`$/);
  });
});
