import { tvdAtMd } from "./depth";
import { intervals } from "./tie";
import type { Bed, Fault, FormationTop, Well } from "./types";

type WellShape = Pick<Well, "id" | "x" | "y" | "rtElevation" | "surveys" | "tops" | "beds">;

export interface AnalogueComponents {
  /** Top of the interval, TVDSS difference to the active well's prognosis, metres. */
  depthDeltaM: number;
  /** Vertical thickness difference, metres. */
  isopachDeltaM: number;
  /** Same side of every mapped fault. */
  sameBlock: boolean;
  /** Difference in the share of coal and sand interbeds, 0 to 1. */
  lithologyDelta: number;
}

export interface Analogue {
  wellId: string;
  /** 0 to 1, higher is a better analogue for this interval. */
  score: number;
  distanceKm: number;
  components: AnalogueComponents;
}

/** How much each part of the comparison counts, and the difference that halves its score. */
export const ANALOGUE_WEIGHTS = {
  depth: { weight: 0.3, halfAtM: 35 },
  isopach: { weight: 0.35, halfAtM: 20 },
  block: { weight: 0.2 },
  lithology: { weight: 0.15, halfAt: 0.08 },
};

const half = (delta: number, at: number) => Math.pow(0.5, (delta / at) ** 2);

/** The interval's top and base in TVDSS, or undefined when the well never drilled through it. */
function interval(well: Pick<Well, "surveys" | "tops" | "rtElevation">, formationId: string) {
  const iv = intervals(well.tops).find((x) => x.formationId === formationId);
  if (iv?.base === undefined) return undefined;
  const top = tvdAtMd(well, iv.top) - well.rtElevation;
  const base = tvdAtMd(well, iv.base) - well.rtElevation;
  return { top, base, mdTop: iv.top, mdBase: iv.base };
}

function interbedShare(beds: Bed[], mdTop: number, mdBase: number) {
  const inside = beds.filter((b) => b.mdTop >= mdTop && b.mdBase <= mdBase);
  const thick = inside.reduce((s, b) => s + (b.mdBase - b.mdTop), 0);
  return thick / Math.max(1, mdBase - mdTop);
}

/**
 * Ranks offsets as analogues for one interval of the active well by geology, not by distance:
 * structural position, thickness, fault block and interbed content. Distance is carried alongside.
 */
export function rankAnalogues(active: WellShape, activeTops: FormationTop[], offsets: WellShape[], formationId: string, faults: Fault[]): Analogue[] {
  const a = interval({ ...active, tops: activeTops }, formationId);
  if (!a) return [];
  const aShare = interbedShare(active.beds, a.mdTop, a.mdBase);
  const side = (x: number) => faults.map((f) => x > f.x);
  const aSide = side(active.x).join();
  const out: Analogue[] = [];
  for (const o of offsets) {
    const b = interval(o, formationId);
    if (!b) continue;
    const depthDeltaM = Math.abs(b.top - a.top);
    const isopachDeltaM = Math.abs(b.base - b.top - (a.base - a.top));
    const sameBlock = side(o.x).join() === aSide;
    // The active well's own interbeds are only known above the bit; ahead of it, compare against the field.
    const lithologyDelta = aShare > 0 ? Math.abs(interbedShare(o.beds, b.mdTop, b.mdBase) - aShare) : 0;
    const w = ANALOGUE_WEIGHTS;
    const score =
      w.depth.weight * half(depthDeltaM, w.depth.halfAtM) +
      w.isopach.weight * half(isopachDeltaM, w.isopach.halfAtM) +
      w.block.weight * (sameBlock ? 1 : 0) +
      w.lithology.weight * half(lithologyDelta, w.lithology.halfAt);
    out.push({
      wellId: o.id,
      score: Math.round(score * 1000) / 1000,
      distanceKm: Math.round(Math.hypot(o.x - active.x, o.y - active.y) / 100) / 10,
      components: {
        depthDeltaM: Math.round(depthDeltaM * 10) / 10,
        isopachDeltaM: Math.round(isopachDeltaM * 10) / 10,
        sameBlock,
        lithologyDelta: Math.round(lithologyDelta * 1000) / 1000,
      },
    });
  }
  return out.sort((x, y) => y.score - x.score || x.distanceKm - y.distanceKm);
}
