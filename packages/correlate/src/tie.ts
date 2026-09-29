import { mdAtTvd, tvdAtMd } from "./depth";
import type { FormationTop, TopCall, Well } from "./types";

export interface Interval {
  formationId: string;
  top: number;
  /** Next top down, or undefined for the deepest formation reached. */
  base: number | undefined;
}

export function intervals(tops: FormationTop[]): Interval[] {
  const sorted = [...tops].sort((a, b) => a.md - b.md);
  return sorted.map((t, i) => ({ formationId: t.formationId, top: t.md, base: sorted[i + 1]?.md }));
}

export function intervalOf(tops: FormationTop[], formationId: string): Interval {
  const found = intervals(tops).find((iv) => iv.formationId === formationId);
  if (!found) throw new Error(`no top for formation ${formationId}`);
  return found;
}

export function formationAtMd(tops: FormationTop[], md: number): string | undefined {
  let current: string | undefined;
  for (const iv of intervals(tops)) if (md >= iv.top) current = iv.formationId;
  return current;
}

/**
 * Re-hangs the prognosis from a called top.
 * The called top moves to its called depth and every deeper prognosed top moves by the same
 * vertical amount, so the planned isopachs below the call are held.
 * Tops above the call keep their depths and status.
 */
export function retie(well: Pick<Well, "surveys">, tops: FormationTop[], call: TopCall): FormationTop[] {
  const sorted = [...tops].sort((a, b) => a.md - b.md);
  const index = sorted.findIndex((t) => t.formationId === call.formationId);
  const called = sorted[index];
  if (!called) throw new Error(`cannot re-tie: no prognosed top for ${call.formationId}`);
  const shiftTvd = tvdAtMd(well, call.md) - tvdAtMd(well, called.md);
  return sorted.map((t, i) => {
    if (i < index) return t;
    if (i === index) return { formationId: t.formationId, md: call.md, status: "called" };
    return { ...t, md: mdAtTvd(well, tvdAtMd(well, t.md) + shiftTvd) };
  });
}

/** Linear blend between two versions of the same top list, for the re-tie animation. */
export function blendTops(from: FormationTop[], to: FormationTop[], t: number): FormationTop[] {
  return from.map((a) => {
    const b = to.find((x) => x.formationId === a.formationId);
    if (!b) return a;
    return { formationId: a.formationId, md: a.md + (b.md - a.md) * t, status: t < 1 ? a.status : b.status };
  });
}
