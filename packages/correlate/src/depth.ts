import type { SurveyStation, Well } from "./types";

const RAD = Math.PI / 180;

/**
 * Fills in TVD for survey stations by the minimum curvature method.
 * The first station must be at the rotary table (md 0, tvd 0).
 */
export function minimumCurvature(stations: Omit<SurveyStation, "tvd">[]): SurveyStation[] {
  const out: SurveyStation[] = [];
  let tvd = 0;
  stations.forEach((s, i) => {
    if (i > 0) {
      const p = stations[i - 1]!;
      const i1 = p.inc * RAD;
      const i2 = s.inc * RAD;
      const a1 = p.azi * RAD;
      const a2 = s.azi * RAD;
      const cosDogleg = Math.cos(i2 - i1) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(a2 - a1));
      const dogleg = Math.acos(Math.min(1, Math.max(-1, cosDogleg)));
      const ratio = dogleg < 1e-9 ? 1 : (2 / dogleg) * Math.tan(dogleg / 2);
      tvd += ((s.md - p.md) / 2) * (Math.cos(i1) + Math.cos(i2)) * ratio;
    }
    out.push({ ...s, tvd });
  });
  return out;
}

function interpolate(stations: SurveyStation[], value: number, from: "md" | "tvd", to: "md" | "tvd"): number {
  const first = stations[0];
  if (!first) throw new Error("well has no survey stations");
  if (value <= first[from]) return first[to] + (value - first[from]);
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1]!;
    const b = stations[i]!;
    if (value <= b[from]) {
      const t = (value - a[from]) / (b[from] - a[from]);
      return a[to] + t * (b[to] - a[to]);
    }
  }
  // Beyond the last station, hold the last inclination.
  const last = stations[stations.length - 1]!;
  const cos = Math.cos(last.inc * RAD);
  const dv = value - last[from];
  return last[to] + (from === "md" ? dv * cos : dv / cos);
}

export function tvdAtMd(well: Pick<Well, "surveys">, md: number): number {
  return interpolate(well.surveys, md, "md", "tvd");
}

export function mdAtTvd(well: Pick<Well, "surveys">, tvd: number): number {
  return interpolate(well.surveys, tvd, "tvd", "md");
}

/** Section display depth: TVD below the datum well's rotary table. */
export function displayAtMd(well: Pick<Well, "surveys" | "rtElevation">, md: number, datumRt: number): number {
  return tvdAtMd(well, md) - well.rtElevation + datumRt;
}

export function mdAtDisplay(well: Pick<Well, "surveys" | "rtElevation">, display: number, datumRt: number): number {
  return mdAtTvd(well, display + well.rtElevation - datumRt);
}
