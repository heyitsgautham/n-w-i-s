// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePageImage } from "./use-page-image";

/** Stands in for the browser's Image, so a test decides when a page loads or fails. */
class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() {
    FakeImage.made.push(this);
  }
}

const last = () => FakeImage.made[FakeImage.made.length - 1];

describe("usePageImage", () => {
  beforeEach(() => {
    FakeImage.made = [];
    vi.stubGlobal("Image", FakeImage);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("is loading until the page arrives, then ready", () => {
    const { result } = renderHook(() => usePageImage("http://api/documents/A/pages/1.png"));
    expect(result.current).toBe("loading");
    expect(last().src).toBe("http://api/documents/A/pages/1.png");
    act(() => last().onload?.());
    expect(result.current).toBe("ready");
  });

  it("is missing when the API answers 404 for an unrendered report", () => {
    const { result } = renderHook(() => usePageImage("http://api/documents/B/pages/1.png"));
    act(() => last().onerror?.());
    expect(result.current).toBe("missing");
  });

  it("starts over for a new page and ignores the old one finishing late", () => {
    const { result, rerender } = renderHook(({ src }) => usePageImage(src), { initialProps: { src: "http://api/a.png" } });
    const first = last();
    act(() => first.onerror?.());
    expect(result.current).toBe("missing");
    rerender({ src: "http://api/b.png" });
    expect(result.current).toBe("loading");
    expect(first.onerror).toBeNull();
    act(() => last().onload?.());
    expect(result.current).toBe("ready");
  });
});
