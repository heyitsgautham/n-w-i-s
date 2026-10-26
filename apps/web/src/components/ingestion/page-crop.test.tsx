// @vitest-environment happy-dom
import type { OffsetEvent } from "@wells/correlate";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageCrop } from "./ingestion-screen";

class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() {
    FakeImage.made.push(this);
  }
}

/** KN-107-B06 from the demo pack's review queue: a scanned page whose incident block sits at this box. */
const event = {
  id: "KN-107-B06",
  source: { docId: "KN-107-2013-06-04", page: 1, bbox: [49.7, 324.0, 381.2, 379.1], ocr: true },
} as unknown as OffsetEvent;

describe("PageCrop", () => {
  beforeEach(() => {
    FakeImage.made = [];
    vi.stubGlobal("Image", FakeImage);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("crops the incident block out of the page image, 360 px wide", () => {
    const { getByRole } = render(<PageCrop e={event} />);
    act(() => FakeImage.made[0].onload?.());
    const crop = getByRole("img", { name: "Scanned passage" });
    const z = 360 / (381.2 - 49.7 + 16);
    expect(crop.style.width).toBe("360px");
    expect(parseFloat(crop.style.height)).toBeCloseTo((379.1 - 324.0 + 12) * z, 3);
    expect(crop.style.backgroundImage).toContain("/documents/KN-107-2013-06-04/pages/1.png?scale=2");
    const [x, y] = crop.style.backgroundPosition.split(" ").map(parseFloat);
    expect(x).toBeCloseTo(-(49.7 - 8) * z, 3);
    expect(y).toBeCloseTo(-(324.0 - 6) * z, 3);
  });

  // In a checkout where `make data` has not run, this page answers 404 and the crop used to stay a blank white box.
  it("says the page is not rendered when the image fails, at the same size", () => {
    const { container, queryByRole } = render(<PageCrop e={event} />);
    act(() => FakeImage.made[0].onerror?.());
    expect(queryByRole("img")).toBeNull();
    const note = container.querySelector<HTMLElement>("[data-page-missing]");
    expect(note?.textContent).toBe("Not rendered in this checkout. Run make data to render it.");
    expect(note?.style.width).toBe("360px");
  });

  it("draws nothing for an event with no box on the page", () => {
    const noBox = { ...event, source: { ...event.source, bbox: undefined } } as OffsetEvent;
    const { container } = render(<PageCrop e={noBox} />);
    expect(container.innerHTML).toBe("");
  });
});
