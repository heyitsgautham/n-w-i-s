import type { StructureGrid } from "@wells/correlate";

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Marching squares over the structure grid, in field metres. Cells that straddle a fault are
 * skipped, so contours stop at the fault instead of piling up along it as if it were a slope.
 */
export function contourSegments(grid: StructureGrid, level: number, faultXs: number[]): Segment[] {
  const { x0, y0, step, nx, ny, values } = grid;
  const v = (i: number, j: number) => values[j * nx + i]!;
  const out: Segment[] = [];
  const lerp = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const xa = x0 + i * step;
      const xb = xa + step;
      if (faultXs.some((f) => f > xa && f < xb)) continue;
      const ya = y0 + j * step;
      const yb = ya + step;
      const c = [v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)] as const;
      const idx = (c[0] > level ? 1 : 0) | (c[1] > level ? 2 : 0) | (c[2] > level ? 4 : 0) | (c[3] > level ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const e = [
        { x: xa + lerp(c[0], c[1]) * step, y: ya },
        { x: xb, y: ya + lerp(c[1], c[2]) * step },
        { x: xa + lerp(c[3], c[2]) * step, y: yb },
        { x: xa, y: ya + lerp(c[0], c[3]) * step },
      ] as const;
      const pairs: [number, number][] = (
        {
          1: [[3, 0]],
          2: [[0, 1]],
          3: [[3, 1]],
          4: [[1, 2]],
          5: [
            [3, 0],
            [1, 2],
          ],
          6: [[0, 2]],
          7: [[3, 2]],
          8: [[2, 3]],
          9: [[0, 2]],
          10: [
            [0, 1],
            [2, 3],
          ],
          11: [[1, 2]],
          12: [[1, 3]],
          13: [[0, 1]],
          14: [[3, 0]],
        } as Record<number, [number, number][]>
      )[idx]!;
      for (const [a, b] of pairs) out.push({ x1: e[a].x, y1: e[a].y, x2: e[b].x, y2: e[b].y });
    }
  }
  return out;
}

export function gridRange(grid: StructureGrid): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of grid.values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}
