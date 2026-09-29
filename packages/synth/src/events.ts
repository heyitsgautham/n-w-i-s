import { intervalOf, intervals, mdAtTvd, tvdAtMd, type EventKind, type FormationTop, type Lesson, type MudStep, type SurveyStation } from "@wells/correlate";
import { mudAt } from "./history";
import { rng, type Rng } from "./rng";
import { HAZARDS, HERO_EVENTS, RESERVED_FOR_SECTION, SECTION_ORDER, type HeroEventSpec } from "./scenario";
import { round1 } from "./wells";

/** Everything about an event the generator decides before the well is drilled. */
export interface EventSpec {
  id: string;
  wellId: string;
  kind: EventKind;
  title: string;
  md: number;
  mudWeightPpg: number;
  mudAfterPpg?: number;
  nptHours: number;
  lossRateBblH?: number;
  narrative: string;
  action: string;
  remarks: string;
  lessons: Lesson[];
}

interface WellShape {
  id: string;
  tops: FormationTop[];
  surveys: SurveyStation[];
  tdMd: number;
}

/** Measured depth of an authored event in its offset, from its formation-relative position. */
export function heroEventMd(well: WellShape, spec: HeroEventSpec): number {
  const iv = intervalOf(well.tops, spec.formationId);
  if (iv.base === undefined) throw new Error(`${well.id} has no base for ${spec.formationId}`);
  const tvd = spec.anchor === "top" ? tvdAtMd(well, iv.top) + spec.offsetM : tvdAtMd(well, iv.base) - spec.offsetM;
  return round1(mdAtTvd(well, tvd));
}

export function heroEventSpecs(well: WellShape): EventSpec[] {
  return HERO_EVENTS.filter((spec) => spec.wellId === well.id).map((spec) => ({
    id: spec.id,
    wellId: spec.wellId,
    kind: spec.kind,
    title: spec.title,
    md: heroEventMd(well, spec),
    mudWeightPpg: spec.mudWeightPpg,
    ...(spec.mudAfterPpg !== undefined ? { mudAfterPpg: spec.mudAfterPpg } : {}),
    nptHours: spec.nptHours,
    ...(spec.lossRateBblH !== undefined ? { lossRateBblH: spec.lossRateBblH } : {}),
    narrative: spec.narrative,
    action: spec.action,
    remarks: spec.remarks,
    lessons: spec.lessons,
  }));
}

type Draft = Omit<EventSpec, "id" | "wellId" | "kind" | "title" | "md" | "mudWeightPpg">;

const lognormal = (r: Rng, median: number, sigma: number) => round1(Math.exp(r.normal(Math.log(median), sigma)));

const DRAFT: Record<EventKind, (r: Rng, md: number, mw: number) => Draft> = {
  "tight-hole": (r, md) => ({
    narrative: `Overpull of ${Math.round(r.range(12, 30))} t at ${fmt(md)} m while pulling out of hole.`,
    action: "Worked through with back-reaming and circulated the hole clean.",
    remarks: "Back-ream stands through the Girujan on every trip.",
    nptHours: lognormal(r, 5, 0.4),
    lessons: [],
  }),
  "bit-balling": (r) => ({
    narrative: `ROP fell to ${Math.round(r.range(3, 6))} m/h with low torque, bit balled in sticky clay.`,
    action: "Pumped a detergent sweep and raised flow. ROP recovered.",
    remarks: "Run a detergent sweep every 150 m in the Girujan.",
    nptHours: lognormal(r, 3.5, 0.4),
    lessons: [],
  }),
  losses: (r, _md, mw) => {
    const rate = Math.round(r.range(12, 45));
    return {
      narrative: `Partial losses of ${rate} bbl/h at ${mw.toFixed(1)} ppg.`,
      action: `Pumped a ${Math.round(r.range(30, 60))} bbl LCM pill and reduced flow. Losses cured.`,
      remarks: `Pre-treat with 15 ppb LCM and hold ECD under ${(mw + 0.4).toFixed(1)} ppg.`,
      nptHours: lognormal(r, 14, 0.5),
      lossRateBblH: rate,
      lessons: [],
    };
  },
  kick: (r, _md, mw) => {
    const up = round1(r.range(0.3, 0.6));
    return {
      narrative: `Pit gain of ${Math.round(r.range(6, 18))} bbl at ${mw.toFixed(1)} ppg, well shut in.`,
      action: `Circulated out by the driller's method and raised mud weight by ${up.toFixed(1)} ppg.`,
      remarks: `Weight up ahead of the Kopili ramp, trip margin ${up.toFixed(1)} ppg.`,
      nptHours: lognormal(r, 48, 0.35),
      mudAfterPpg: round1(mw + up),
      lessons: [],
    };
  },
  caving: (r, _md, mw) => {
    const to = round1(mw + r.range(0.4, 0.7));
    return {
      narrative: `Coal-shale cavings over the shakers at ${mw.toFixed(1)} ppg, torque erratic on connections.`,
      action: `Pumped hi-vis sweeps and raised mud weight to ${to.toFixed(1)} ppg.`,
      remarks: `Caved at ${mw.toFixed(1)} ppg, hole stable at ${to.toFixed(1)} ppg.`,
      nptHours: lognormal(r, 16, 0.45),
      mudAfterPpg: to,
      lessons: [{ kind: "raise-mud-weight", toPpg: to, evidence: `Caved at ${mw.toFixed(1)} ppg, hole stable at ${to.toFixed(1)} ppg.` }],
    };
  },
  "stuck-pipe": (r) => {
    const minutes = Math.round(r.range(25, 55) / 5) * 5;
    return {
      narrative: `Could not pick up after ${minutes} min static on a connection. Cavings packed off above the BHA.`,
      action: `Jarred down, spotted a pipe-freeing pill and worked free after ${Math.round(r.range(14, 30))} h.`,
      remarks: `Stuck after ${minutes} min static on a connection. Keep the string static under 10 min in the coal-shale.`,
      nptHours: lognormal(r, 36, 0.35),
      lessons: [{ kind: "limit-static-time", minutes: 10, evidence: `Stuck after ${minutes} min static on a connection.` }],
    };
  },
  "differential-sticking": (r, _md, mw) => ({
    narrative: `Differentially stuck across the Main Sand at ${mw.toFixed(1)} ppg after a ${Math.round(r.range(20, 45))} min survey.`,
    action: "Spotted a pipe-freeing pill, worked the string and came free.",
    remarks: "Keep the string moving across the Main Sand.",
    nptHours: lognormal(r, 18, 0.4),
    lessons: [],
  }),
};

/**
 * Background events from the hazard rates. The section wells' Barail belongs to the authored events.
 * Events are drafted in depth order against the live mud schedule, so a weight-up after a kick is the
 * weight the next report and the next event see. Returns the events and the schedule with their steps.
 */
export function backgroundEventSpecs(
  seed: number,
  well: WellShape,
  schedule: MudStep[],
  keepClear: number[],
): { events: EventSpec[]; mud: MudStep[] } {
  const r = rng(seed, `${well.id}/events`);
  const inSection = SECTION_ORDER.includes(well.id);
  const candidates: { md: number; hazard: (typeof HAZARDS)[string][number] }[] = [];
  for (const iv of intervals(well.tops)) {
    if (inSection && RESERVED_FOR_SECTION.includes(iv.formationId)) continue;
    const base = Math.min(iv.base ?? well.tdMd, well.tdMd);
    for (const hazard of HAZARDS[iv.formationId] ?? []) {
      const count = r.poisson((hazard.per100m * (base - iv.top)) / 100);
      for (let i = 0; i < count; i++) candidates.push({ md: round1(r.range(iv.top + 8, base - 8)), hazard });
    }
  }
  // Keep a stand of hole between events, and clear of casing points and authored events.
  const taken = [...keepClear];
  const kept = candidates
    .sort((a, b) => a.md - b.md)
    .filter((c) => {
      if (taken.some((m) => Math.abs(m - c.md) < 30)) return false;
      taken.push(c.md);
      return true;
    });
  const mud = [...schedule];
  const events: EventSpec[] = kept.map((c, i) => {
    const mw = mudAt(mud, c.md);
    const draft = DRAFT[c.hazard.kind](r, c.md, mw);
    if (draft.mudAfterPpg !== undefined) {
      mud.push({ fromMd: round1(c.md + 0.1), ppg: draft.mudAfterPpg });
      mud.sort((a, b) => a.fromMd - b.fromMd);
    }
    return { id: `${well.id}-B${String(i + 1).padStart(2, "0")}`, wellId: well.id, kind: c.hazard.kind, title: c.hazard.title, md: c.md, mudWeightPpg: mw, ...draft };
  });
  return { events, mud };
}

function fmt(md: number): string {
  return Math.round(md).toLocaleString("en-US");
}
