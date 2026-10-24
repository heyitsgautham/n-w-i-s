import type { StructureGrid } from "@wells/correlate";
import { describe, expect, it } from "vitest";
import { contourSegments, gridRange } from "./contours";

/** A plane dipping east: TVDSS = 2800 + x / 10 over a 4 by 3 grid, 100 m spacing from (0, 0). */
const plane: StructureGrid = {
  formationId: "BCS",
  x0: 0,
  y0: 0,
  step: 100,
  nx: 4,
  ny: 3,
  values: Array.from({ length: 12 }, (_, k) => 2800 + ((k % 4) * 100) / 10),
};

describe("contourSegments", () => {
  it("draws a plane's contour as a straight north-south line at the right easting", () => {
    const segs = contourSegments(plane, 2815, []);
    expect(segs).toHaveLength(2);
    for (const s of segs) {
      expect(s.x1).toBeCloseTo(150, 9);
      expect(s.x2).toBeCloseTo(150, 9);
    }
    const ys = segs.flatMap((s) => [s.y1, s.y2]).sort((a, b) => a - b);
    expect(ys).toEqual([0, 100, 100, 200]);
  });

  it("draws nothing for a level outside the grid", () => {
    expect(contourSegments(plane, 2700, [])).toEqual([]);
    expect(contourSegments(plane, 2900, [])).toEqual([]);
  });

  it("stops at a fault instead of following the cell that straddles it", () => {
    expect(contourSegments(plane, 2815, [150])).toEqual([]);
    expect(contourSegments(plane, 2815, [100])).toHaveLength(2);
  });

  it("splits a saddle cell into two segments", () => {
    const saddle: StructureGrid = { ...plane, nx: 2, ny: 2, values: [10, 0, 0, 10] };
    const segs = contourSegments(saddle, 5, []);
    expect(segs).toHaveLength(2);
    expect(segs).toContainEqual({ x1: 0, y1: 50, x2: 50, y2: 0 });
    expect(segs).toContainEqual({ x1: 100, y1: 50, x2: 50, y2: 100 });
  });
});

describe("gridRange", () => {
  it("returns the shallowest and deepest values", () => {
    expect(gridRange(plane)).toEqual([2800, 2830]);
  });
});
