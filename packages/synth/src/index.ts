import {
  retie,
  type DailyReport,
  type DemoPack,
  type FormationTop,
  type OffsetEvent,
  type StructureGrid,
  type Well,
} from "@wells/correlate";
import { FORMATIONS } from "./column";
import { backgroundEventSpecs, heroEventSpecs, type EventSpec } from "./events";
import { placeGeneratedOffsets, scheduleSpud, slotOf, type RigSlot } from "./field";
import { addDays, curveOf, dailyReports, holeSections, mudSchedule, simulate, type SimEvent } from "./history";
import { buildReplay } from "./replay";
import { rng } from "./rng";
import { ACTIVE, DRILLING, FIELD, REPLAY, SECTION_OFFSETS, SECTION_ORDER, SEED, STRUCTURE } from "./scenario";
import { activeReferenceTvdss, beds, forceSeam, gammaRay, offsetTops, round1, structuralDelta, trajectory } from "./wells";

export { SEED } from "./scenario";

interface Draft {
  id: string;
  x: number;
  y: number;
  rtElevation: number;
  tdMd: number;
  surveys: Well["surveys"];
  tops: FormationTop[];
  fixed?: { spudDate: string; rig: string };
  targetYear?: number;
}

const toSim = (e: EventSpec): SimEvent => ({
  id: e.id,
  kind: e.kind,
  title: e.title,
  md: e.md,
  nptHours: e.nptHours,
  narrative: e.narrative,
  action: e.action,
  remarks: e.remarks,
});

/**
 * Builds the whole demo pack from one seed. Same seed, same pack, byte for byte.
 *
 * The active well's `tops` are the prognosis as it stands before the replay (called tops above the
 * bit, prognosed below). Its `beds` and `gammaRay` are ground truth to the end of the replay, and the
 * UI reveals them only as the bit, the LWD sensor and the lagged samples reach each depth.
 * Offsets are drilled by the history simulator, which dates every event and writes every daily report.
 */
export function buildDemoPack(seed: number = SEED): DemoPack {
  const activeSurveys = trajectory(seed, ACTIVE.id, ACTIVE.plannedTdMd);
  const prognosis: FormationTop[] = [
    ...Object.entries(ACTIVE.called).map(([formationId, md]) => ({ formationId, md, status: "called" as const })),
    ...Object.entries(ACTIVE.prognosed).map(([formationId, md]) => ({ formationId, md, status: "prognosed" as const })),
  ];
  const reference = activeReferenceTvdss(activeSurveys);

  const drafts: Draft[] = [
    ...SECTION_OFFSETS.map((o) => ({ ...o, fixed: { spudDate: o.spudDate, rig: o.rig } })),
    ...placeGeneratedOffsets(seed).map((p) => ({ ...p, tdMd: 0 })),
  ].map((o) => {
    const rtElevation = round1(rng(seed, `${o.id}/rt`).range(114, 123));
    const provisional = o.tdMd || 4800;
    const surveys = trajectory(seed, o.id, provisional);
    let tops = offsetTops(seed, { ...o, rtElevation, tdMd: provisional, surveys }, reference);
    let tdMd = o.tdMd;
    if (!tdMd) {
      const syl = tops.find((t) => t.formationId === "SYL")!;
      tdMd = round1(syl.md + rng(seed, `${o.id}/td`).range(140, 300));
      tops = tops.filter((t) => t.md < tdMd);
    }
    return { id: o.id, x: o.x, y: o.y, rtElevation, tdMd, surveys, tops, ...("fixed" in o ? { fixed: o.fixed } : {}), ...("targetYear" in o ? { targetYear: o.targetYear } : {}) };
  });

  // Plan and drill every offset. Durations come first; the rig schedule needs them to date the wells.
  const drilled = drafts.map((d) => {
    const sections = holeSections(d.tops, d.tdMd);
    const hero = heroEventSpecs(d);
    const schedule = mudSchedule(d.id, sections, d.tops, hero);
    const clear = [...sections.map((s) => s.shoeMd), ...hero.map((e) => e.md)];
    const bg = backgroundEventSpecs(seed, d, schedule, clear);
    const events = [...hero, ...bg.events].sort((a, b) => a.md - b.md);
    let list = beds(seed, d.id, d.tops, d.tdMd);
    for (const e of events) if (e.kind === "caving" || e.kind === "stuck-pipe") list = forceSeam(list, e.md);
    const sim = simulate({ seed, wellId: d.id, tops: d.tops, beds: list, sections, events: events.map(toSim), tdMd: d.tdMd });
    return { d, sections, mud: bg.mud, events, beds: list, sim, days: Math.ceil((sim.endT + DRILLING.spudHour) / 24) };
  });

  const busy: RigSlot[] = drilled.filter((x) => x.d.fixed).map((x) => slotOf(x.d.fixed!.rig, x.d.fixed!.spudDate, x.days));
  const dated = drilled
    .slice()
    .sort((a, b) => (a.d.targetYear ?? 0) - (b.d.targetYear ?? 0))
    .map((x) => ({ ...x, when: x.d.fixed ?? scheduleSpud(seed, x.d.id, x.d.targetYear!, x.days, busy) }));

  const offsets: Well[] = [];
  const events: OffsetEvent[] = [];
  const reports: DailyReport[] = [];
  for (const id of drafts.map((d) => d.id)) {
    const x = dated.find((w) => w.d.id === id)!;
    const { d, sections, mud, sim, when } = x;
    const inSection = SECTION_ORDER.includes(d.id);
    offsets.push({
      id: d.id,
      role: "offset",
      x: d.x,
      y: d.y,
      rtElevation: d.rtElevation,
      spudDate: when.spudDate,
      rig: when.rig,
      tdMd: d.tdMd,
      surveys: d.surveys,
      tops: d.tops,
      beds: x.beds,
      gammaRay: inSection ? gammaRay(seed, d.id, d.tops, x.beds, 0, Math.floor(d.tdMd)) : [],
      sections,
      mud,
      curve: curveOf(sim),
      releaseDate: addDays(when.spudDate, Math.floor((sim.endT + DRILLING.spudHour) / 24)),
    });
    reports.push(...dailyReports({ seed, wellId: d.id, spudDate: when.spudDate, sim, sections, mud, surveys: d.surveys, events: x.events.map(toSim) }));
    for (const e of x.events) {
      const t = sim.eventT.get(e.id)!;
      const date = addDays(when.spudDate, Math.floor((t + DRILLING.spudHour) / 24));
      events.push({
        id: e.id,
        wellId: e.wellId,
        kind: e.kind,
        title: e.title,
        md: e.md,
        date,
        mudWeightPpg: e.mudWeightPpg,
        nptHours: e.nptHours,
        ...(e.lossRateBblH !== undefined ? { lossRateBblH: e.lossRateBblH } : {}),
        narrative: e.narrative,
        action: e.action,
        remarks: e.remarks,
        lessons: e.lessons,
        source: { docId: `${e.wellId}-${date}`, page: null },
        confidence: 1,
      });
    }
  }

  // The active well: drilled for real up to the call, and planned to TD with no NPT.
  const activeShell = { surveys: activeSurveys };
  const truthTops = retie(activeShell, prognosis, { formationId: REPLAY.call.formationId, md: REPLAY.call.md });
  const truthDepth = REPLAY.bitAtCallMd + 20;
  const activeBeds = beds(seed, ACTIVE.id, truthTops, truthDepth, REPLAY.call.md);
  const replay = buildReplay(seed, truthTops, activeBeds);
  const lastTick = replay.ticks[replay.ticks.length - 1]!;
  const planSections = holeSections(prognosis, ACTIVE.plannedTdMd);
  const actual = simulate({ seed, wellId: ACTIVE.id, tops: truthTops, beds: activeBeds, sections: holeSections(truthTops, ACTIVE.plannedTdMd), events: [], tdMd: ACTIVE.plannedTdMd, stopAtMd: REPLAY.bitAtCallMd });
  const plan = simulate({ seed, wellId: `${ACTIVE.id}/plan`, tops: prognosis, beds: [], sections: planSections, events: [], tdMd: ACTIVE.plannedTdMd });
  const spudMs = Date.parse(REPLAY.callTime) + 5.5 * 3600e3 - actual.endT * 3600e3;
  const activeSpud = new Date(spudMs).toISOString().slice(0, 10);

  const active: Well = {
    id: ACTIVE.id,
    role: "active",
    x: ACTIVE.x,
    y: ACTIVE.y,
    rtElevation: ACTIVE.rtElevation,
    spudDate: activeSpud,
    rig: ACTIVE.rig,
    tdMd: lastTick.bitMd,
    surveys: activeSurveys,
    tops: prognosis,
    beds: activeBeds,
    gammaRay: gammaRay(seed, ACTIVE.id, truthTops, activeBeds, 0, Math.floor(truthDepth)),
    sections: planSections,
    mud: mudSchedule(ACTIVE.id, planSections, prognosis, []),
    curve: curveOf(actual),
    planCurve: curveOf(plan),
  };

  const g = STRUCTURE.grid;
  const structure: StructureGrid = {
    formationId: "BCS",
    ...g,
    values: Array.from({ length: g.nx * g.ny }, (_, i) => {
      const x = g.x0 + (i % g.nx) * g.step;
      const y = g.y0 + Math.floor(i / g.nx) * g.step;
      return round1(reference.BCS! + structuralDelta("BCS", x, y));
    }),
  };

  return {
    seed,
    field: FIELD,
    faults: [{ name: STRUCTURE.fault.name, x: STRUCTURE.fault.x, throwM: STRUCTURE.fault.throw }],
    structure,
    formations: FORMATIONS,
    activeWellId: ACTIVE.id,
    sectionOrder: SECTION_ORDER,
    wells: [active, ...offsets],
    events: events.sort((a, b) => (a.wellId === b.wellId ? a.md - b.md : a.wellId.localeCompare(b.wellId))),
    reports,
    replay,
    bands: { prepareHours: 12, watchHours: 24 },
  };
}
