import { formationAtMd, intervals } from "./tie";
import type { EventKind, FormationTop, HoleSection, OffsetEvent, Well } from "./types";

export interface Citation {
  eventId: string;
  wellId: string;
  docId: string;
  date: string;
  page: number | null;
}

export interface BriefingLine {
  id: string;
  text: string;
  cites: Citation[];
}

export interface BriefingSection {
  sizeIn: string;
  casingIn: string;
  topMd: number;
  shoeMd: number;
  formations: string[];
  eventCount: number;
  lines: BriefingLine[];
}

const KIND_NOUN: Record<EventKind, string> = {
  caving: "Coal-shale caving",
  "stuck-pipe": "Stuck pipe",
  losses: "Losses",
  "tight-hole": "Tight hole",
  "bit-balling": "Bit balling",
  "differential-sticking": "Differential sticking",
  kick: "Kicks",
};

const cite = (e: OffsetEvent): Citation => ({ eventId: e.id, wellId: e.wellId, docId: e.source.docId, date: e.date, page: e.source.page });

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const range = (xs: number[]) => {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? `${lo.toFixed(1)} ppg` : `${lo.toFixed(1)} to ${hi.toFixed(1)} ppg`;
};

/** Newest first, so the citation an engineer opens first is the most recent practice. */
const newest = (es: OffsetEvent[]) => [...es].sort((a, b) => b.date.localeCompare(a.date));

/**
 * Writes the pre-spud offset review for a planned well, hole section by hole section.
 * Every line is built from parsed offset events and carries the report pages it came from;
 * a line with nothing to cite is not written.
 */
export function composeBriefing(opts: {
  sections: HoleSection[];
  prognosis: FormationTop[];
  offsets: Pick<Well, "id" | "tops" | "sections">[];
  events: OffsetEvent[];
  formationName: (id: string) => string;
}): BriefingSection[] {
  const byWell = new Map(opts.offsets.map((w) => [w.id, w]));
  return opts.sections.map((s) => {
    const formations = intervals(opts.prognosis)
      .filter((iv) => iv.top < s.shoeMd && (iv.base ?? Infinity) > s.topMd)
      .map((iv) => iv.formationId);
    // An offset event belongs to this section when it happened in the offset's own hole of this size.
    const events = opts.events.filter((e) => {
      const w = byWell.get(e.wellId);
      if (!w || e.needsReview) return false;
      const own = w.sections.find((x) => x.sizeIn === s.sizeIn);
      return own !== undefined && e.md > own.topMd && e.md <= own.shoeMd;
    });
    const formationOf = (e: OffsetEvent) => formationAtMd(byWell.get(e.wellId)!.tops, e.md)!;
    const lines: BriefingLine[] = [];

    const groups = new Map<string, OffsetEvent[]>();
    for (const e of events) {
      const key = `${e.kind}|${formationOf(e)}`;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    for (const [key, group] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      const [kind, formation] = key.split("|") as [EventKind, string];
      const es = newest(group);
      const wells = [...new Set(es.map((e) => e.wellId))];
      const npt = median(es.map((e) => e.nptHours));
      const loss = es.filter((e) => e.lossRateBblH !== undefined).map((e) => e.lossRateBblH!);
      const parts = [
        `${KIND_NOUN[kind]} in the ${opts.formationName(formation)}: ${es.length} ${es.length === 1 ? "event" : "events"} in ${wells.length} ${wells.length === 1 ? "well" : "wells"}`,
        `median NPT ${npt.toFixed(1)} h`,
        `at ${range(es.map((e) => e.mudWeightPpg))}`,
      ];
      if (loss.length) parts.push(loss.length === 1 ? `${loss[0]} bbl/h` : `${Math.min(...loss)} to ${Math.max(...loss)} bbl/h`);
      lines.push({ id: `${s.sizeIn}-${key}`, text: `${parts.join(", ")}.`, cites: es.slice(0, 3).map(cite) });
    }

    // What the offsets say to do, in their own words, one line per kind of advice.
    const seen = new Set<string>();
    for (const e of newest(events)) {
      for (const lesson of e.lessons) {
        if (seen.has(lesson.kind)) continue;
        seen.add(lesson.kind);
        const f = opts.formationName(formationOf(e));
        const text =
          lesson.kind === "raise-mud-weight"
            ? `Carry at least ${lesson.toPpg!.toFixed(1)} ppg through the ${f}. ${e.wellId}: "${lesson.evidence}"`
            : lesson.kind === "limit-static-time"
              ? `Keep the string static under ${lesson.minutes} min at surveys and connections. ${e.wellId}: "${lesson.evidence}"`
              : `Plan a wiper trip before drilling on through the ${f}. ${e.wellId}: "${lesson.evidence}"`;
        lines.push({ id: `${s.sizeIn}-${lesson.kind}`, text, cites: [cite(e)] });
      }
      const remark = e.remarks.split(/(?<=\.)\s+/).find((x) => /\b(hold|keep|pre-treat|run|back-ream|weight up)\b/i.test(x));
      const key = `remark-${e.kind}`;
      if (remark && !seen.has(key) && e.lessons.length === 0) {
        seen.add(key);
        lines.push({ id: `${s.sizeIn}-${key}`, text: `${remark} (${e.wellId}, ${KIND_NOUN[e.kind].toLowerCase()})`, cites: [cite(e)] });
      }
    }

    return {
      sizeIn: s.sizeIn,
      casingIn: s.casingIn,
      topMd: s.topMd,
      shoeMd: s.shoeMd,
      formations,
      eventCount: events.length,
      lines,
    };
  });
}
