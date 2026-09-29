import {
  blendTops,
  buildAlerts,
  displayAtMd,
  recommend,
  retie,
  type Alert,
  type FormationTop,
  type Recommendation,
  type RigMessage,
  type Telemetry,
} from "@wells/correlate";
import type { HeroModel, SectionWell } from "./hero-model";

/** The mud-log message shows first, then the section re-ties. */
export const RETIE_DELAY_MS = 700;
export const RETIE_MS = 1500;
export const TIMELINE_MS = RETIE_DELAY_MS + RETIE_MS + 900;

export interface NumberedAlert extends Alert {
  n: number;
  /** Band the same event had on the prognosis before the latest call, to show what the call changed. */
  bandBefore: Alert["band"];
  hoursBefore: number | null;
  mdBefore: number;
}

export interface CallState {
  message: RigMessage;
  before: FormationTop[];
  after: FormationTop[];
  /** Milliseconds since the call arrived in this session, or null when the page opened after it. */
  elapsedMs: number | null;
  /** Re-tie progress, 0 to 1, already eased. */
  progress: number;
  shiftM: number;
  /** Alerts whose band the call changed, as they stood on the call tick. The log line keeps these. */
  flips: { n: number; band: Alert["band"]; hours: number | null }[];
}

export interface Scene {
  telemetry: Telemetry;
  active: SectionWell;
  tops: FormationTop[];
  prognosis: FormationTop[];
  call: CallState | null;
  alerts: NumberedAlert[];
  /** Ahead of the bit but below the drawn window. */
  deeper: Alert[];
  /** Offset events the bit has already passed, by formation. */
  passed: Alert[];
  recommendation: Recommendation | undefined;
  messages: RigMessage[];
  /** The formation the bit is in by the current tops, and the next top below it. */
  formationAtBit: { top: FormationTop; next: FormationTop | undefined } | undefined;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function retieProgress(elapsedMs: number | null): number {
  if (elapsedMs === null) return 1;
  return easeInOutCubic(Math.min(1, Math.max(0, (elapsedMs - RETIE_DELAY_MS) / RETIE_MS)));
}

export function buildScene(model: HeroModel, tick: number, callElapsedMs: number | null): Scene {
  const telemetry = model.replay.ticks[tick];
  if (!telemetry) throw new Error(`no telemetry for tick ${tick}`);
  const active = model.wells.find((w) => w.id === model.activeWellId)!;
  const prognosis = active.tops;

  const calls = model.replay.messages.filter((m) => m.topCall && m.tick <= tick);
  let before = prognosis;
  let after = prognosis;
  for (const m of calls) {
    before = after;
    after = retie(active, after, m.topCall!);
  }
  const lastCall = calls[calls.length - 1];
  const progress = lastCall ? retieProgress(callElapsedMs) : 1;
  const tops = lastCall ? blendTops(before, after, progress) : prognosis;

  const alertsFor = (activeTops: FormationTop[]) =>
    buildAlerts({
      events: model.events,
      wells: model.wells,
      active,
      activeTops,
      bitMd: telemetry.bitMd,
      ropMph: telemetry.ropAvg,
      bands: model.bands,
    });

  const now = alertsFor(tops);
  const prior = lastCall ? alertsFor(before) : now;
  const inWindow = (a: Alert) => displayAtMd(active, a.projection.md, model.datumRt) <= model.window.bottom;
  const ahead = now.filter((a) => a.band !== "passed");
  const alerts: NumberedAlert[] = ahead.filter(inWindow).map((a, i) => {
    const p = prior.find((x) => x.event.id === a.event.id);
    return { ...a, n: i + 1, bandBefore: p?.band ?? a.band, hoursBefore: p?.hours ?? a.hours, mdBefore: p?.projection.md ?? a.projection.md };
  });

  /** Band changes the call caused, frozen at the call tick so the log line never drifts. */
  const flipsAt = (callTick: number) => {
    const t = model.replay.ticks[callTick] ?? telemetry;
    const at = (activeTops: FormationTop[]) =>
      buildAlerts({ events: model.events, wells: model.wells, active, activeTops, bitMd: t.bitMd, ropMph: t.ropAvg, bands: model.bands }).filter(
        (a) => a.band !== "passed" && inWindow(a),
      );
    const was = at(before);
    return at(after).flatMap((a, i) => {
      const w = was.find((x) => x.event.id === a.event.id);
      return w && w.band !== a.band ? [{ n: i + 1, band: a.band, hours: a.hours }] : [];
    });
  };

  const bcs = lastCall?.topCall?.formationId;
  const beforeTop = before.find((t) => t.formationId === bcs);
  const afterTop = after.find((t) => t.formationId === bcs);

  const sorted = [...tops].sort((a, b) => a.md - b.md);
  const hereIndex = sorted.findLastIndex((t) => telemetry.bitMd >= t.md);
  const formationAtBit = hereIndex >= 0 ? { top: sorted[hereIndex]!, next: sorted[hereIndex + 1] } : undefined;

  return {
    telemetry,
    active,
    tops,
    prognosis,
    call:
      lastCall && beforeTop && afterTop
        ? {
            message: lastCall,
            before,
            after,
            elapsedMs: callElapsedMs,
            progress,
            shiftM: afterTop.md - beforeTop.md,
            flips: flipsAt(lastCall.tick),
          }
        : null,
    alerts,
    deeper: ahead.filter((a) => !inWindow(a)),
    passed: now.filter((a) => a.band === "passed"),
    recommendation: recommend(now, telemetry.mudWeightPpg),
    messages: model.replay.messages.filter((m) => m.tick <= tick),
    formationAtBit,
  };
}
