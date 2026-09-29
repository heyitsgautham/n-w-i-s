import { mdAtTvd, tvdAtMd } from "./depth";
import { intervals } from "./tie";
import type { AlertBands, FormationTop, OffsetEvent, Well } from "./types";

export type Anchor = "top" | "base";

export interface Projection {
  formationId: string;
  /** Which boundary of the formation the event is measured from. */
  anchor: Anchor;
  /** Vertical distance from that boundary in the offset well, metres. */
  offsetM: number;
  /** Where the same formation-relative position falls in the active well, m MD. */
  md: number;
}

/**
 * Places an offset event on the active well by formation, not by depth.
 * The event keeps its vertical distance from the nearer boundary of its formation,
 * so an event near a base stays near the base when the formation thins or thickens.
 */
export function projectEvent(
  event: OffsetEvent,
  offset: Pick<Well, "surveys" | "tops">,
  active: Pick<Well, "surveys">,
  activeTops: FormationTop[],
): Projection | undefined {
  const source = intervals(offset.tops).find((iv) => event.md >= iv.top && (iv.base === undefined || event.md < iv.base));
  if (!source || source.base === undefined) return undefined;
  const target = intervals(activeTops).find((iv) => iv.formationId === source.formationId);
  if (!target || target.base === undefined) return undefined;

  const evTvd = tvdAtMd(offset, event.md);
  const fromTop = evTvd - tvdAtMd(offset, source.top);
  const fromBase = tvdAtMd(offset, source.base) - evTvd;
  const anchor: Anchor = fromTop <= fromBase ? "top" : "base";

  const topTvd = tvdAtMd(active, target.top);
  const baseTvd = tvdAtMd(active, target.base);
  const raw = anchor === "top" ? topTvd + fromTop : baseTvd - fromBase;
  const tvd = Math.min(baseTvd, Math.max(topTvd, raw));
  return {
    formationId: source.formationId,
    anchor,
    offsetM: anchor === "top" ? fromTop : fromBase,
    md: mdAtTvd(active, tvd),
  };
}

export type Band = "prepare" | "watch" | "monitor" | "passed";

/** On-bottom hours until the bit reaches a depth at the given rate. Null once the bit is past it. */
export function hoursTo(bitMd: number, targetMd: number, ropMph: number): number | null {
  if (targetMd <= bitMd) return null;
  return (targetMd - bitMd) / ropMph;
}

export function bandFor(hours: number | null, bands: AlertBands): Band {
  if (hours === null) return "passed";
  if (hours <= bands.prepareHours) return "prepare";
  if (hours <= bands.watchHours) return "watch";
  return "monitor";
}

export interface Alert {
  event: OffsetEvent;
  projection: Projection;
  hours: number | null;
  band: Band;
  /** Metres of hole between the bit and the projected hazard. */
  aheadM: number;
}

type WellShape = Pick<Well, "id" | "surveys" | "tops">;

export interface AlertInput {
  events: OffsetEvent[];
  wells: WellShape[];
  active: WellShape;
  activeTops: FormationTop[];
  bitMd: number;
  ropMph: number;
  bands: AlertBands;
}

export function buildAlerts(input: AlertInput): Alert[] {
  const byId = new Map(input.wells.map((w) => [w.id, w]));
  const out: Alert[] = [];
  for (const event of input.events) {
    const offset = byId.get(event.wellId);
    if (!offset) continue;
    const projection = projectEvent(event, offset, input.active, input.activeTops);
    if (!projection) continue;
    const hours = hoursTo(input.bitMd, projection.md, input.ropMph);
    out.push({
      event,
      projection,
      hours,
      band: bandFor(hours, input.bands),
      aheadM: projection.md - input.bitMd,
    });
  }
  return out.sort((a, b) => a.projection.md - b.projection.md);
}

/**
 * Time to hazard is hours out at a rate that wanders by a few metres an hour, so anything finer
 * than ten minutes is false precision. 13.5 hours reads "13 h 30 m".
 */
export const ETA_STEP_MINUTES = 10;

export function formatHours(hours: number): string {
  const minutes = Math.round((hours * 60) / ETA_STEP_MINUTES) * ETA_STEP_MINUTES;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, "0")} m`;
}
