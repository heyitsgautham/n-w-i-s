// @vitest-environment happy-dom
import type { OffsetEvent } from "@wells/correlate";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageViewer } from "./event-drawer";

class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() {
    FakeImage.made.push(this);
  }
}

/** A scanned page from a well whose PDFs are not committed, so a fresh checkout answers 404 for it. */
const event = {
  id: "KN-107-B06",
  wellId: "KN-107",
  lessons: [],
  source: { docId: "KN-107-2013-06-04", page: 1, bbox: [49.7, 324.0, 381.2, 379.1], ocr: true },
} as unknown as OffsetEvent;

describe("PageViewer", () => {
  beforeEach(() => {
    FakeImage.made = [];
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "no rendered document KN-107-2013-06-04" }), { status: 404 })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers the PDF while the page loads", () => {
    const { getByText, container } = render(<PageViewer event={event} />);
    expect(getByText("Open PDF").closest("a")?.getAttribute("href")).toBe("http://localhost:8121/documents/KN-107-2013-06-04.pdf");
    expect(container.querySelector("[data-page-missing]")).toBeNull();
  });

  // Before, the 404 words body crashed the console, and the 404 image showed as a broken picture.
  it("says the report is not rendered when its page is missing, and drops the dead PDF link", async () => {
    const { container, queryByText } = render(<PageViewer event={event} />);
    await act(async () => FakeImage.made[0]!.onerror?.());
    expect(container.querySelector("[data-page-missing]")?.textContent).toContain("Run make data to render all of them.");
    expect(container.querySelector("[data-page-caption]")?.textContent).toBe("· not rendered in this checkout");
    expect(queryByText("Open PDF")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
