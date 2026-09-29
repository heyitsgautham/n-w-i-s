import {
  buildAlerts,
  displayAtMd,
  mdAtDisplay,
  type AlertBands,
  type Bed,
  type Formation,
  type FormationTop,
  type OffsetEvent,
  type Replay,
  type SurveyStation,
  type WellRole,
} from "@wells/correlate";
import type { Field } from "./data";

/** Alerts further out than this do not stretch the section window. */
const WINDOW_HORIZON_HOURS = 72;
const WINDOW_ABOVE_BIT_M = 100;
const WINDOW_BELOW_LAST_ALERT_M = 60;

export interface DisplayBed extends Bed {
  dTop: number;
  dBase: number;
}

export interface SectionWell {
  id: string;
  role: WellRole;
  rtElevation: number;
  spudYear: number;
  rig: string;
  tdMd: number;
  /** Distance and compass bearing from the active well, null for the active well itself. */
  distanceKm: number | null;
  bearing: string | null;
  surveys: SurveyStation[];
  tops: FormationTop[];
  beds: DisplayBed[];
  /** Gamma ray sliced to the window, with section display depth precomputed. */
  gamma: { md: number; d: number; v: number }[];
}

export interface SectionFault {
  name: string;
  throwM: number;
  /** Index of the gap the fault falls in, counting gaps left to right. */
  gap: number;
  /** Position across that gap, 0 at the western well and 1 at the eastern. */
  at: number;
}

/** Every well in the field, light enough to ship to the browser for labels and the drawer. */
export interface WellCard {
  id: string;
  role: WellRole;
  distanceKm: number;
  bearing: string;
  spudDate: string;
  rig: string;
  tops: FormationTop[];
}

export interface HeroModel {
  seed: number;
  field: Field["field"];
  wellIndex: WellCard[];
  formations: Formation[];
  bands: AlertBands;
  datumRt: number;
  window: { top: number; bottom: number };
  activeWellId: string;
  wells: SectionWell[];
  events: OffsetEvent[];
  replay: Replay;
  faults: SectionFault[];
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function bearingOf(dx: number, dy: number): string {
  return COMPASS[Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) / 45) % 8]!;
}

/**
 * The correlation section's model. Events are the parsed ones, and only those that may raise an
 * alert: confirmed or confident enough, and from the wells on the section.
 */
export function buildHeroModel(pack: Field, parsed: OffsetEvent[]): HeroModel {
  const active = pack.wells.find((w) => w.id === pack.activeWellId);
  if (!active) throw new Error("pack has no active well");
  const datumRt = active.rtElevation;
  const open = pack.replay.ticks[pack.replay.openTick];
  if (!open) throw new Error("replay has no open tick");

  const inSection = pack.sectionOrder.map((id) => {
    const w = pack.wells.find((x) => x.id === id);
    if (!w) throw new Error(`section well ${id} missing from pack`);
    return w;
  });
  const sectionIds = new Set(pack.sectionOrder);
  const events = parsed.filter((e) => sectionIds.has(e.wellId) && !e.needsReview);

  const opening = buildAlerts({
    events,
    wells: inSection,
    active,
    activeTops: active.tops,
    bitMd: open.bitMd,
    ropMph: open.ropAvg,
    bands: pack.bands,
  }).filter((a) => a.hours !== null && a.hours <= WINDOW_HORIZON_HOURS);
  const deepest = Math.max(open.bitMd, ...opening.map((a) => a.projection.md));
  const window = {
    top: Math.floor((displayAtMd(active, open.bitMd, datumRt) - WINDOW_ABOVE_BIT_M) / 10) * 10,
    bottom: Math.ceil((displayAtMd(active, deepest, datumRt) + WINDOW_BELOW_LAST_ALERT_M) / 10) * 10,
  };

  const wells: SectionWell[] = inSection.map((w) => {
    const mdTop = mdAtDisplay(w, window.top - 20, datumRt);
    const mdBottom = mdAtDisplay(w, window.bottom + 20, datumRt);
    const dx = w.x - active.x;
    const dy = w.y - active.y;
    const isActive = w.id === active.id;
    return {
      id: w.id,
      role: w.role,
      rtElevation: w.rtElevation,
      spudYear: Number(w.spudDate.slice(0, 4)),
      rig: w.rig,
      tdMd: w.tdMd,
      distanceKm: isActive ? null : Math.round(Math.hypot(dx, dy) / 100) / 10,
      bearing: isActive ? null : bearingOf(dx, dy),
      surveys: w.surveys,
      tops: w.tops,
      beds: w.beds
        .filter((b) => b.mdBase >= mdTop && b.mdTop <= mdBottom)
        .map((b) => ({ ...b, dTop: displayAtMd(w, b.mdTop, datumRt), dBase: displayAtMd(w, b.mdBase, datumRt) })),
      gamma: w.gammaRay
        .filter((s) => s.md >= mdTop && s.md <= mdBottom)
        .map((s) => ({ md: s.md, d: displayAtMd(w, s.md, datumRt), v: s.value })),
    };
  });

  const faults: SectionFault[] = pack.faults.flatMap((f) => {
    for (let i = 0; i < inSection.length - 1; i++) {
      const a = inSection[i]!;
      const b = inSection[i + 1]!;
      if (f.x > a.x && f.x < b.x) return [{ name: f.name, throwM: f.throwM, gap: i, at: (f.x - a.x) / (b.x - a.x) }];
    }
    return [];
  });

  return {
    seed: pack.seed,
    field: pack.field,
    wellIndex: pack.wells.map((w) => ({
      id: w.id,
      role: w.role,
      distanceKm: Math.round(Math.hypot(w.x - active.x, w.y - active.y) / 100) / 10,
      bearing: bearingOf(w.x - active.x, w.y - active.y),
      spudDate: w.spudDate,
      rig: w.rig,
      tops: w.tops,
    })),
    formations: pack.formations,
    bands: pack.bands,
    datumRt,
    window,
    activeWellId: active.id,
    wells,
    events,
    replay: {
      ...pack.replay,
      ropByDepth: pack.replay.ropByDepth.filter((s) => displayAtMd(active, s.md, datumRt) >= window.top - 20),
    },
    faults,
  };
}
