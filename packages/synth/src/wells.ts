import {
  intervals,
  mdAtTvd,
  minimumCurvature,
  tvdAtMd,
  type Bed,
  type CurveSample,
  type FormationTop,
  type Lithology,
  type SurveyStation,
} from "@wells/correlate";
import { BARAIL_COAL_SEAMS, FORMATIONS, GAMMA, INTERBEDS, STRUCTURE_GROWTH } from "./column";
import { rng } from "./rng";
import { ACTIVE, STRUCTURE } from "./scenario";

/** Isopachs below the active well's planned TD, used only to hang the deepest offset tops. */
const DEEP_ISOPACH: Record<string, number> = { LGP: 260, BSM: 80 };

export function trajectory(seed: number, wellId: string, tdMd: number): SurveyStation[] {
  const r = rng(seed, `${wellId}/trajectory`);
  const maxInc = r.range(0.7, 1.6);
  let azi = r.range(0, 360);
  const stations: Omit<SurveyStation, "tvd">[] = [{ md: 0, inc: 0, azi }];
  for (let md = 30; md <= tdMd + 60; md += 30) {
    const t = Math.min(1, md / tdMd);
    const inc = Math.max(0, maxInc * (3 * t * t - 2 * t * t * t) + r.normal(0, 0.06));
    azi = (azi + r.normal(0, 2.5) + 360) % 360;
    stations.push({ md, inc, azi });
  }
  return minimumCurvature(stations);
}

function anticline(x: number, y: number): number {
  const a = STRUCTURE.anticline;
  const r2 = (x - a.x) ** 2 + (y - a.y) ** 2;
  return -a.amplitude * Math.exp(-r2 / (2 * a.sigma ** 2));
}

/** Depth of a surface at (x, y) relative to the same surface at the active well, metres, positive down. */
export function structuralDelta(formationId: string, x: number, y: number): number {
  const g = STRUCTURE_GROWTH[formationId] ?? 1;
  const regional = STRUCTURE.dipEast * x + STRUCTURE.dipNorth * y;
  const fold = anticline(x, y) - anticline(0, 0);
  const fault = g >= 0.4 && x > STRUCTURE.fault.x ? STRUCTURE.fault.throw : 0;
  return g * (regional + fold + fault);
}

/** TVDSS of every surface at the active well, as the prognosis and the calls so far put it. */
export function activeReferenceTvdss(activeSurveys: SurveyStation[]): Record<string, number> {
  const ref: Record<string, number> = {};
  const all = { ...ACTIVE.called, ...ACTIVE.prognosed };
  for (const [id, md] of Object.entries(all)) ref[id] = tvdAtMd({ surveys: activeSurveys }, md) - ACTIVE.rtElevation;
  let last = ref.SYL!;
  for (const [id, thickness] of Object.entries(DEEP_ISOPACH)) {
    last += thickness;
    ref[id] = last;
  }
  return ref;
}

export function offsetTops(
  seed: number,
  well: { id: string; x: number; y: number; rtElevation: number; tdMd: number; surveys: SurveyStation[] },
  reference: Record<string, number>,
): FormationTop[] {
  const r = rng(seed, `${well.id}/tops`);
  const tops: FormationTop[] = [];
  for (const f of FORMATIONS) {
    const ref = reference[f.id];
    if (ref === undefined) continue;
    const g = STRUCTURE_GROWTH[f.id] ?? 1;
    const tvdss = ref + structuralDelta(f.id, well.x, well.y) + r.normal(0, STRUCTURE.residualSd * g);
    const md = mdAtTvd(well, tvdss + well.rtElevation);
    if (md < well.tdMd) tops.push({ formationId: f.id, md: round1(md), status: "log" });
  }
  return tops;
}

export function lithologyOf(formationId: string): Lithology {
  const f = FORMATIONS.find((x) => x.id === formationId);
  if (!f) throw new Error(`unknown formation ${formationId}`);
  return f.lithology;
}

/**
 * Interbeds and coal seams for one well. `quietAbove` keeps a clean interval directly above a
 * depth, which the active well uses so the sand above the Barail contact drills and logs clean.
 */
export function beds(seed: number, wellId: string, tops: FormationTop[], tdMd: number, quietAbove?: number): Bed[] {
  const r = rng(seed, `${wellId}/beds`);
  const out: Bed[] = [];
  for (const iv of intervals(tops)) {
    const base = Math.min(iv.base ?? tdMd, tdMd);
    if (iv.formationId === "BCS") {
      for (const rel of BARAIL_COAL_SEAMS) {
        const top = iv.top + rel + r.normal(0, 2.5);
        const thick = r.range(1.2, 3.4);
        if (top + thick < base - 4) out.push({ lithology: "coal", mdTop: round1(top), mdBase: round1(top + thick) });
      }
    }
    for (const rule of INTERBEDS[iv.formationId] ?? []) {
      let at = iv.top + rule.spacing * r.range(0.3, 1);
      while (at < base - 3) {
        const thick = r.range(rule.thickness[0], rule.thickness[1]);
        const bed = { lithology: rule.lithology, mdTop: round1(at), mdBase: round1(Math.min(at + thick, base - 1)) };
        const clashes = out.some((b) => b.mdTop < bed.mdBase + 1 && bed.mdTop < b.mdBase + 1);
        const quiet = quietAbove !== undefined && bed.mdBase > quietAbove - 15 && bed.mdTop < quietAbove;
        if (!clashes && !quiet) out.push(bed);
        at += thick + rule.spacing * r.range(0.5, 1.5);
      }
    }
  }
  return out.sort((a, b) => a.mdTop - b.mdTop);
}

/** Makes sure a coal seam straddles a depth, replacing any bed it overlaps. */
export function forceSeam(list: Bed[], md: number): Bed[] {
  const seam: Bed = { lithology: "coal", mdTop: round1(md - 1.4), mdBase: round1(md + 1.3) };
  const kept = list.filter((b) => b.mdBase < seam.mdTop - 1 || b.mdTop > seam.mdBase + 1);
  return [...kept, seam].sort((a, b) => a.mdTop - b.mdTop);
}

export function lithologyAt(tops: FormationTop[], bedList: Bed[], md: number): Lithology {
  const bed = bedList.find((b) => md >= b.mdTop && md < b.mdBase);
  if (bed) return bed.lithology;
  let formation = tops[0]?.formationId ?? "ALV";
  for (const t of tops) if (md >= t.md) formation = t.formationId;
  return lithologyOf(formation);
}

/** Wireline-style gamma ray at 1 m, smoothed over 3 m to stand in for tool resolution. */
export function gammaRay(seed: number, wellId: string, tops: FormationTop[], bedList: Bed[], fromMd: number, toMd: number): CurveSample[] {
  const r = rng(seed, `${wellId}/gamma`);
  const raw: number[] = [];
  for (let md = fromMd; md <= toMd; md += 1) {
    const [mean, sd] = GAMMA[lithologyAt(tops, bedList, md)];
    raw.push(r.normal(mean, sd * 0.6));
  }
  return raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 1), i + 2);
    return { md: fromMd + i, value: round1(w.reduce((s, v) => s + v, 0) / w.length) };
  });
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
