import { afterEach, describe, expect, it, vi } from "vitest";
import { envOr } from "./env";

describe("envOr", () => {
  it("keeps a set value, trimmed", () => {
    expect(envOr(" http://api:8121 ", "x")).toBe("http://api:8121");
  });

  it.each([undefined, "", "   "])("falls back for %j", (value) => {
    expect(envOr(value, "fallback")).toBe("fallback");
  });
});

describe("modules that read the environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Each line here is how .env.example ships: the name, an equals sign, nothing after it.
  it("use their defaults when a variable is empty", async () => {
    for (const name of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_BRAND", "NEXT_PUBLIC_BRAND_LABEL", "WELLS_API_URL", "WELLS_DATA_DIR"]) {
      vi.stubEnv(name, "");
    }
    const { API } = await import("./api");
    const { BRAND, LABEL } = await import("./brand");
    const data = await import("./data");
    expect(API).toBe("http://localhost:8121");
    expect([BRAND, LABEL]).toEqual(["N-W-I-S", "Oil India Limited"]);
    expect(data.API_URL).toBe("http://127.0.0.1:8121");
    expect(data.loadField().activeWellId).toBe("KN-125");
  });

  it("read a value that is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://wells.example");
    const { API } = await import("./api");
    expect(API).toBe("https://wells.example");
  });
});
