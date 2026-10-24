import type { Alert } from "./alerts";
import type { Lesson } from "./types";

export interface RecommendationLine {
  kind: Lesson["kind"];
  /** The instruction, with every number taken from the alert or the live telemetry. */
  text: string;
  evidence: string;
  wellId: string;
  eventId: string;
}

export interface Recommendation {
  /** The alert that sets the deadline, the nearest one in PREPARE or WATCH. */
  lead: Alert;
  lines: RecommendationLine[];
}

const depth = (md: number) => `${Math.round(md).toLocaleString("en-US")} m`;

/**
 * Turns the lessons attached to upcoming offset events into one ordered action list.
 * Only alerts in PREPARE or WATCH contribute, nearest first, one line per kind of action.
 */
export function recommend(alerts: Alert[], currentMudWeightPpg: number): Recommendation | undefined {
  const upcoming = alerts.filter((a) => a.band === "prepare" || a.band === "watch").sort((a, b) => (a.hours ?? 0) - (b.hours ?? 0));
  const lead = upcoming[0];
  if (!lead) return undefined;

  const seen = new Set<Lesson["kind"]>();
  const lines: RecommendationLine[] = [];
  for (const alert of upcoming) {
    for (const lesson of alert.event.lessons) {
      if (seen.has(lesson.kind)) continue;
      const text = phrase(lesson, alert, currentMudWeightPpg);
      if (!text) continue;
      seen.add(lesson.kind);
      lines.push({ kind: lesson.kind, text, evidence: lesson.evidence, wellId: alert.event.wellId, eventId: alert.event.id });
    }
  }
  return { lead, lines };
}

function phrase(lesson: Lesson, alert: Alert, currentMw: number): string | undefined {
  switch (lesson.kind) {
    case "raise-mud-weight":
      if (lesson.toPpg === undefined || currentMw >= lesson.toPpg) return undefined;
      return `Raise mud weight ${currentMw.toFixed(1)} → ${lesson.toPpg.toFixed(1)} ppg before ${depth(alert.projection.md)}`;
    case "wiper-trip":
      return `Wiper trip before drilling past ${depth(alert.projection.md)}, log overpull`;
    case "limit-static-time":
      if (lesson.minutes === undefined) return undefined;
      return `Keep the string static under ${lesson.minutes} min at surveys and connections`;
  }
}
