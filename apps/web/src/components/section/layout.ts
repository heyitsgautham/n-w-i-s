import { displayAtMd, type FormationTop } from "@wells/correlate";
import type { SectionWell } from "@/lib/hero-model";

export interface Track {
  x0: number;
  x1: number;
}

export interface WellLayout {
  well: SectionWell;
  active: boolean;
  /** -1 west of the active well, 0 the active well, 1 east of it. */
  side: -1 | 0 | 1;
  gr: Track;
  lith: Track;
  rop?: Track;
  lane?: Track;
  /** Where tie lines leave the well on each side. */
  left: number;
  right: number;
  center: number;
}

export interface SectionLayout {
  width: number;
  height: number;
  ruler: Track;
  headerTop: number;
  drawTop: number;
  drawBottom: number;
  pxPerM: number;
  windowTop: number;
  windowBottom: number;
  wells: WellLayout[];
  y: (display: number) => number;
}

const RULER = 64;
const HEADER = 92;
const PAD_RIGHT = 30;
const OFFSET = { gr: 44, lith: 34 };
const ACTIVE = { gr: 40, lith: 48, rop: 44, lane: 136 };

/**
 * Wells sit at equal spacing, which is how a correlation panel is read: the horizontal axis is
 * not to scale and the header gives the real distances. Offsets east of the active well are
 * mirrored so every lithology column faces the active well.
 */
export function layoutSection(width: number, height: number, wells: SectionWell[], activeId: string, window: { top: number; bottom: number }): SectionLayout {
  const activeIndex = wells.findIndex((w) => w.id === activeId);
  const offsetCount = wells.length - 1;
  const fixed = RULER + offsetCount * (OFFSET.gr + OFFSET.lith) + ACTIVE.gr + ACTIVE.lith + ACTIVE.rop + PAD_RIGHT;
  const gap = Math.max(40, (width - fixed - ACTIVE.lane) / offsetCount);

  let x = RULER;
  const out: WellLayout[] = [];
  wells.forEach((well, i) => {
    if (i > 0) x += gap + (i === activeIndex + 1 ? ACTIVE.lane : 0);
    if (i === activeIndex) {
      const gr = { x0: x, x1: x + ACTIVE.gr };
      const lith = { x0: gr.x1, x1: gr.x1 + ACTIVE.lith };
      const rop = { x0: lith.x1, x1: lith.x1 + ACTIVE.rop };
      const lane = { x0: rop.x1, x1: rop.x1 + ACTIVE.lane };
      out.push({ well, active: true, side: 0, gr, lith, rop, lane, left: gr.x0, right: rop.x1, center: lith.x0 + ACTIVE.lith / 2 });
      x = rop.x1;
      return;
    }
    const side = i < activeIndex ? -1 : 1;
    const first = side < 0 ? OFFSET.gr : OFFSET.lith;
    const a = { x0: x, x1: x + first };
    const b = { x0: a.x1, x1: a.x1 + (side < 0 ? OFFSET.lith : OFFSET.gr) };
    const gr = side < 0 ? a : b;
    const lith = side < 0 ? b : a;
    out.push({ well, active: false, side, gr, lith, left: a.x0, right: b.x1, center: (a.x0 + b.x1) / 2 });
    x = b.x1;
  });

  const drawTop = HEADER + 8;
  const drawBottom = height - 6;
  const pxPerM = (drawBottom - drawTop) / (window.bottom - window.top);
  return {
    width,
    height,
    ruler: { x0: 0, x1: RULER - 10 },
    headerTop: 0,
    drawTop,
    drawBottom,
    pxPerM,
    windowTop: window.top,
    windowBottom: window.bottom,
    wells: out,
    y: (d) => drawTop + (d - window.top) * pxPerM,
  };
}

export interface DisplayInterval {
  formationId: string;
  top: number;
  base: number;
  status: FormationTop["status"];
}

/** Formation intervals of a well in section display depth. The last one runs past the window. */
export function displayIntervals(well: SectionWell, tops: FormationTop[], datumRt: number, beyond: number): DisplayInterval[] {
  const sorted = [...tops].sort((a, b) => a.md - b.md);
  return sorted.map((t, i) => {
    const next = sorted[i + 1];
    return {
      formationId: t.formationId,
      top: displayAtMd(well, t.md, datumRt),
      base: next ? displayAtMd(well, next.md, datumRt) : beyond,
      status: t.status,
    };
  });
}
