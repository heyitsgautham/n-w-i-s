import {
  formationAtMd,
  intervalOf,
  tvdAtMd,
  type Bed,
  type CurvePoint,
  type DailyReport,
  type EventKind,
  type FormationTop,
  type HoleSection,
  type Incident,
  type MudStep,
  type OpCode,
  type OpRow,
  type SurveyStation,
} from "@wells/correlate";
import { rng, type Rng } from "./rng";
import { CLEAN_SCANS, DRILLING, HOLE_PROGRAM, KOPILI_STEP, MUD_OVERRIDES, REPLAY } from "./scenario";
import { round1 } from "./wells";

/** An event the simulator must stop for when the bit reaches its depth. */
export interface SimEvent {
  id: string;
  kind: EventKind;
  title: string;
  md: number;
  nptHours: number;
  narrative: string;
  action: string;
  remarks: string;
}

interface Op {
  t0: number;
  t1: number;
  code: OpCode;
  /** Depth at the start and end of the op. Only drilling changes depth. */
  md0: number;
  md1: number;
  text: string;
  eventId?: string;
  /** Drilling ops fold into blocks in the report; this marks the connections inside them. */
  connection?: boolean;
}

interface BitRun {
  no: number;
  sizeIn: string;
  type: string;
  depthIn: number;
  tIn: number;
  tOut: number;
  depthOut: number;
  drillHours: number;
}

export interface Simulation {
  ops: Op[];
  bits: BitRun[];
  endT: number;
  /** Hours since spud when each event started. */
  eventT: Map<string, number>;
}

export function holeSections(tops: FormationTop[], tdMd: number): HoleSection[] {
  const out: HoleSection[] = [];
  let top = 0;
  for (const p of HOLE_PROGRAM) {
    const shoe = p.shoe ? intervalOf(tops, p.shoe.formationId).top + p.shoe.offsetM : tdMd;
    out.push({ sizeIn: p.sizeIn, casingIn: p.casingIn, topMd: round1(top), shoeMd: round1(Math.min(shoe, tdMd)) });
    top = shoe;
  }
  return out;
}

/** Mud weight in use from each depth, section by section, with the offset's own practice and its events. */
export function mudSchedule(wellId: string, sections: HoleSection[], tops: FormationTop[], events: { md: number; mudAfterPpg?: number }[]): MudStep[] {
  const steps: MudStep[] = [];
  sections.forEach((s, i) => {
    const program = HOLE_PROGRAM[i]!;
    steps.push({ fromMd: s.topMd, ppg: MUD_OVERRIDES[wellId]?.[s.sizeIn] ?? program.mudPpg });
  });
  const kopili = tops.find((t) => t.formationId === "KPL");
  if (kopili) steps.push({ fromMd: round1(kopili.md - KOPILI_STEP.aboveTopM), ppg: KOPILI_STEP.ppg });
  for (const e of events) if (e.mudAfterPpg !== undefined) steps.push({ fromMd: round1(e.md + 0.1), ppg: e.mudAfterPpg });
  steps.sort((a, b) => a.fromMd - b.fromMd);
  // A later step only raises the weight within its section; the next section's program resets it.
  return steps;
}

export function mudAt(steps: MudStep[], md: number): number {
  let ppg = steps[0]?.ppg ?? 9;
  for (const s of steps) if (md >= s.fromMd) ppg = s.ppg;
  return ppg;
}

const BIT_TYPES: Record<string, string> = { "26": "Mill tooth, IADC 115", "17½": "PDC, 6 blade", "12¼": "PDC, 6 blade", "8½": "PDC, 7 blade" };

function formationRop(tops: FormationTop[], beds: Bed[], md: number): number {
  const bed = beds.find((b) => md >= b.mdTop && md < b.mdBase);
  if (bed?.lithology === "coal") return DRILLING.coalRop;
  return DRILLING.rop[formationAtMd(tops, md) ?? "TPM"] ?? 15;
}

/**
 * Drills a well stand by stand. Connections, bit trips, casing and cementing, and every event's NPT
 * take the time they take, so days-versus-depth, the daily reports and the event dates all agree.
 */
export function simulate(opts: {
  seed: number;
  wellId: string;
  tops: FormationTop[];
  beds: Bed[];
  sections: HoleSection[];
  events: SimEvent[];
  tdMd: number;
  stopAtMd?: number;
}): Simulation {
  const r: Rng = rng(opts.seed, `${opts.wellId}/drilling`);
  const factor = r.range(0.85, 1.15);
  const ops: Op[] = [];
  const bits: BitRun[] = [];
  const eventT = new Map<string, number>();
  const pending = [...opts.events].sort((a, b) => a.md - b.md);
  let t = 0;
  let md = opts.sections[0]?.topMd ?? 0;
  let bit: BitRun | null = null;
  const stop = opts.stopAtMd ?? Infinity;

  const push = (code: OpCode, hours: number, text: string, extra: Partial<Op> = {}) => {
    const op: Op = { t0: t, t1: t + hours, code, md0: md, md1: md, text, ...extra };
    ops.push(op);
    t = op.t1;
    return op;
  };
  const newBit = (sizeIn: string) => {
    bit = { no: bits.length + 1, sizeIn, type: BIT_TYPES[sizeIn] ?? "PDC", depthIn: md, tIn: t, tOut: t, depthOut: md, drillHours: 0 };
    bits.push(bit);
  };
  const trip = (why: string) => {
    push("CIRC", 1, `Circulated bottoms up at ${fmt(md)} m before tripping.`);
    push("TRIP", md / DRILLING.tripMph + 0.5, `Pulled out of hole from ${fmt(md)} m ${why}.`);
    if (bit) {
      bit.tOut = t;
      bit.depthOut = md;
    }
  };

  outer: for (let si = 0; si < opts.sections.length; si++) {
    const s = opts.sections[si]!;
    if (si > 0) {
      newBit(s.sizeIn);
      push("TRIP", md / DRILLING.tripMph + 1.5, `Made up ${s.sizeIn} in BHA with bit #${bits.length} and ran in hole to ${fmt(md)} m.`);
      push("FIT", DRILLING.fitH, `Drilled out shoe track and 3 m of new formation. FIT to ${(mudAtFit(si) + 1.4).toFixed(1)} ppg EMW.`);
    } else {
      newBit(s.sizeIn);
      push("RIG", 4, "Spudded well. Made up 26 in BHA and tagged bottom.");
    }
    const target = Math.min(s.shoeMd, stop);
    while (md < target - 1e-6) {
      const standEnd = (Math.floor(md / DRILLING.standM + 1e-9) + 1) * DRILLING.standM;
      const next = pending[0];
      const life = bit!.depthIn + (DRILLING.bitLifeM[s.sizeIn] ?? 600);
      const segEnd = Math.min(standEnd, target, next && next.md > md ? next.md : Infinity, life);
      const rop = formationRop(opts.tops, opts.beds, md) * factor * Math.exp(r.normal(0, 0.16));
      const hours = (segEnd - md) / rop;
      ops.push({ t0: t, t1: t + hours, code: "DRL", md0: md, md1: segEnd, text: "" });
      t += hours;
      bit!.drillHours += hours;
      md = segEnd;
      while (pending[0] && pending[0].md <= md + 1e-6) {
        const e = pending.shift()!;
        eventT.set(e.id, t);
        const first = Math.round(e.nptHours * 0.35 * 2) / 2;
        push("NPT", first, e.narrative, { eventId: e.id });
        push("NPT", e.nptHours - first, e.action, { eventId: e.id });
      }
      if (md >= target - 1e-6) break;
      if (Math.abs(md - standEnd) < 1e-6) {
        ops.push({ t0: t, t1: t + DRILLING.connectionH, code: "DRL", md0: md, md1: md, text: "", connection: true });
        t += DRILLING.connectionH;
      }
      if (md >= life - 1e-6) {
        trip("for a bit change");
        newBit(s.sizeIn);
        push("TRIP", md / DRILLING.tripMph + 1, `Ran in hole with bit #${bits.length} to ${fmt(md)} m.`);
      }
    }
    if (md >= stop - 1e-6) break outer;
    const last = si === opts.sections.length - 1;
    push("CIRC", last ? 3 : 2, `Circulated hole clean at ${fmt(md)} m, shakers clean.`);
    trip(last ? "to log" : `to run ${s.casingIn} in casing`);
    if (last) {
      push("LOG", DRILLING.loggingH, `Rigged up wireline, logged GR, resistivity, density-neutron and sonic from ${fmt(md)} m to ${fmt(s.topMd)} m.`);
      push("TRIP", (2 * md) / DRILLING.tripMph + 1, `Made a clean-out trip to ${fmt(md)} m.`);
    }
    push("CSG", md / DRILLING.casingRunMph + 2, `Rigged up and ran ${s.casingIn} in casing to ${fmt(md)} m.`);
    push("CMT", DRILLING.cementH, `Cemented ${s.casingIn} in casing, bumped the plug, floats held.`);
    push("WOC", DRILLING.wocH, "Waited on cement.");
    if (!last) push("BOP", DRILLING.bopH, "Nippled up and pressure tested the BOP stack to 5,000 psi.");
    else push("RIG", 12, "Laid down drill pipe, released rig.");
  }
  if (bit) {
    (bit as BitRun).tOut = t;
    (bit as BitRun).depthOut = md;
  }
  return { ops, bits, endT: t, eventT };

  function mudAtFit(si: number) {
    return HOLE_PROGRAM[si]?.mudPpg ?? 10;
  }
}

export function curveOf(sim: Simulation): CurvePoint[] {
  const pts: CurvePoint[] = [{ day: 0, md: sim.ops[0]?.md0 ?? 0 }];
  for (const op of sim.ops) {
    const last = pts[pts.length - 1]!;
    if (op.code === "DRL" && op.connection) continue;
    if (op.md1 !== last.md || op.t1 / 24 - last.day > 0.5) pts.push({ day: round3(op.t1 / 24), md: round1(op.md1) });
  }
  return pts;
}

/** Folds drilling and connections into report rows of at most six hours. */
function reportRows(
  ops: Op[],
  from: number,
  to: number,
  sizeAt: (md: number) => string,
  flowText: string,
): { rows: OpRow[]; drilled: [number, number] | null } {
  const rows: OpRow[] = [];
  let block: { t0: number; t1: number; md0: number; md1: number } | null = null;
  let drilled: [number, number] | null = null;
  const flush = () => {
    if (!block) return;
    const hours = block.t1 - block.t0;
    const metres = block.md1 - block.md0;
    const size = sizeAt(block.md1);
    rows.push({
      from: hhmm(block.t0 - from),
      to: hhmm(block.t1 - from),
      hours: round2(hours),
      code: "DRL",
      md: round1(block.md1),
      text:
        metres > 0.05
          ? `Drilled ${size} in hole from ${fmt(block.md0)} m to ${fmt(block.md1)} m, avg ROP ${(metres / hours).toFixed(1)} m/h. ${flowText} Connections and MWD surveys each stand.`
          : `Reamed and made connection at ${fmt(block.md1)} m.`,
    });
    block = null;
  };
  for (const op of ops) {
    if (op.t1 <= from || op.t0 >= to) continue;
    const t0 = Math.max(op.t0, from);
    const t1 = Math.min(op.t1, to);
    const f0 = (t0 - op.t0) / (op.t1 - op.t0 || 1);
    const f1 = (t1 - op.t0) / (op.t1 - op.t0 || 1);
    const md0 = op.md0 + (op.md1 - op.md0) * f0;
    const md1 = op.md0 + (op.md1 - op.md0) * f1;
    if (op.code === "DRL") {
      if (md1 > md0) drilled = drilled ? [drilled[0], md1] : [md0, md1];
      if (block && t1 - block.t0 > 6) flush();
      if (!block) block = { t0, t1, md0, md1 };
      else {
        block.t1 = t1;
        block.md1 = md1;
      }
      continue;
    }
    flush();
    rows.push({
      from: hhmm(t0 - from),
      to: hhmm(t1 - from),
      hours: round2(t1 - t0),
      code: op.code,
      md: round1(md1),
      text: op.text,
      ...(op.eventId ? { eventId: op.eventId } : {}),
    });
  }
  flush();
  return { rows, drilled };
}

const SUMMARY: Partial<Record<OpCode, string>> = {
  TRIP: "tripped",
  CIRC: "circulated",
  CSG: "ran casing",
  CMT: "cemented",
  WOC: "waited on cement",
  BOP: "tested the BOP",
  FIT: "drilled out and ran a FIT",
  LOG: "logged",
};

export function dailyReports(opts: {
  seed: number;
  wellId: string;
  spudDate: string;
  sim: Simulation;
  sections: HoleSection[];
  mud: MudStep[];
  surveys: SurveyStation[];
  events: SimEvent[];
}): DailyReport[] {
  const { sim, sections } = opts;
  const r = rng(opts.seed, `${opts.wellId}/reports`);
  const sizeAt = (md: number) => (sections.find((s) => md <= s.shoeMd + 1e-6) ?? sections[sections.length - 1]!).sizeIn;
  const days = Math.ceil((sim.endT + DRILLING.spudHour) / 24);
  const reports: DailyReport[] = [];
  const mdAtT = (time: number) => {
    let md = sim.ops[0]?.md0 ?? 0;
    for (const op of sim.ops) {
      if (op.t0 >= time) break;
      const f = Math.min(1, (time - op.t0) / (op.t1 - op.t0 || 1));
      md = op.md0 + (op.md1 - op.md0) * f;
    }
    return md;
  };
  const flowText = `WOB ${Math.round(r.range(12, 18))} t, ${Math.round(r.range(100, 140))} rpm, ${Math.round(r.range(820, 950) / 10) * 10} gpm.`;
  for (let k = 0; k < days; k++) {
    const from = k * 24 - DRILLING.spudHour;
    const to = from + 24;
    const date = addDays(opts.spudDate, k);
    const startMd = mdAtT(Math.max(0, from));
    const endMd = mdAtT(Math.min(to, sim.endT));
    const { rows, drilled } = reportRows(sim.ops, Math.max(0, from), Math.min(to, sim.endT), sizeAt, flowText);
    // Rows are timed from local midnight; the spud day starts at 06:00.
    const offset = Math.max(0, from) - from;
    const timed = rows.map((row) => ({ ...row, from: shift(row.from, offset), to: shift(row.to, offset) }));
    const incidents: Incident[] = [];
    for (const e of opts.events) {
      const et = sim.eventT.get(e.id);
      if (et === undefined || et < from || et >= to) continue;
      incidents.push({
        eventId: e.id,
        kind: e.kind,
        title: e.title,
        time: hhmm(et - from),
        md: e.md,
        mudWeightPpg: mudAt(opts.mud, e.md),
        nptHours: e.nptHours,
        description: e.narrative,
        action: e.action,
        remarks: e.remarks,
      });
    }
    const bit = [...sim.bits].reverse().find((b) => b.tIn < to) ?? null;
    const nptHours = timed.filter((x) => x.code === "NPT").reduce((s, x) => s + x.hours, 0);
    const size = sizeAt(endMd);
    const parts: string[] = [];
    for (const row of timed) {
      const phrase =
        row.code === "DRL"
          ? drilled && drilled[1] - drilled[0] > 0.5
            ? `drilled ${size} in hole from ${fmt(drilled[0])} m to ${fmt(drilled[1])} m, ${fmt(drilled[1] - drilled[0])} m`
            : undefined
          : SUMMARY[row.code];
      if (phrase && !parts.includes(phrase)) parts.push(phrase);
    }
    let summary = parts.length ? `${capitalise(parts.join(", "))}.` : "Rig operations as per program.";
    if (nptHours > 0) summary += ` NPT ${round1(nptHours)} h: ${incidents.map((i) => i.title.toLowerCase()).join("; ") || "continuing from the previous day"}.`;
    const nextOp = sim.ops.find((op) => op.t0 >= to && op.code !== "DRL");
    const drillingNext = sim.ops.find((op) => op.t0 >= to)?.code === "DRL";
    const forecast =
      to >= sim.endT
        ? "Rig released."
        : drillingNext
          ? `Drill ahead ${size} in hole.`
          : nextOp
            ? `${nextOp.text.split(/\.(?:\s|$)/)[0]}.`
            : "Continue operations.";
    reports.push({
      id: `${opts.wellId}-${date}`,
      wellId: opts.wellId,
      date,
      reportNo: k + 1,
      holeSizeIn: size,
      startMd: round1(startMd),
      endMd: round1(endMd),
      endTvd: round1(tvdAtMd({ surveys: opts.surveys }, endMd)),
      summary,
      forecast,
      ops: timed,
      mud: {
        weightPpg: mudAt(
          opts.mud,
          endMd + (opts.events.some((e) => Math.abs(e.md - endMd) < 0.05 && (sim.eventT.get(e.id) ?? Infinity) + e.nptHours <= to) ? 0.2 : 0),
        ),
        funnelVisS: Math.round(r.range(44, 62)),
        pv: Math.round(r.range(14, 24)),
        yp: Math.round(r.range(16, 26)),
        fluidLossMl: round1(r.range(3.6, 5.8)),
        type: HOLE_PROGRAM.find((p) => p.sizeIn === size)?.mudType ?? "WBM",
      },
      bit: bit
        ? {
            no: bit.no,
            sizeIn: bit.sizeIn,
            type: bit.type,
            depthInMd: round1(bit.depthIn),
            metres: round1(Math.min(endMd, bit.depthOut > bit.depthIn ? bit.depthOut : endMd) - bit.depthIn),
            hours: round1(bit.drillHours),
          }
        : null,
      surveys: opts.surveys
        .filter((s) => s.md > startMd && s.md <= endMd)
        .map((s) => ({ md: s.md, inc: round2(s.inc), azi: round1(s.azi), tvd: round1(s.tvd) })),
      incidents,
      ...(incidents.some((i) => CLEAN_SCANS.includes(i.eventId)) ? { scan: "clean" as const } : {}),
    });
  }
  return reports;
}

/** The drilling replay starts where the simulated history of the active well ends. */
export const ACTIVE_STOP_MD = REPLAY.bitAtCallMd;

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function hhmm(hours: number): string {
  const minutes = Math.round(hours * 60);
  if (minutes >= 24 * 60) return "24:00";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function shift(clock: string, hours: number): string {
  if (hours === 0) return clock;
  const [h, m] = clock.split(":").map(Number) as [number, number];
  return hhmm(h + m / 60 + hours);
}

function fmt(md: number): string {
  return Math.round(md).toLocaleString("en-US");
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
