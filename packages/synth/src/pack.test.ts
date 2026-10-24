import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAlerts, formatHours, recommend, retie, type OffsetEvent } from "@wells/correlate";
import { describe, expect, it } from "vitest";
import { buildDemoPack } from "./index";

const pack = buildDemoPack();

/**
 * The first place two JSON values differ, or undefined when they match.
 * V8 releases differ in the last bit of Math.cos and friends, so the survey numbers in field.json
 * match to a relative 1e-12 rather than bit for bit. Everything else must match exactly.
 */
function driftFrom(committed: unknown, built: unknown, path = "$"): string | undefined {
  if (typeof committed === "number" && typeof built === "number") {
    return Math.abs(committed - built) <= 1e-12 * Math.max(1, Math.abs(committed)) ? undefined : `${path}: ${committed} != ${built}`;
  }
  if (committed === null || built === null || typeof committed !== "object" || typeof built !== "object") {
    return committed === built ? undefined : `${path}: ${String(committed)} != ${String(built)}`;
  }
  const a = committed as Record<string, unknown>;
  const b = built as Record<string, unknown>;
  const keys = Object.keys(a);
  if (Array.isArray(a) !== Array.isArray(b) || keys.join() !== Object.keys(b).join()) return `${path}: keys differ`;
  for (const k of keys) {
    const drift = driftFrom(a[k], b[k], `${path}.${k}`);
    if (drift) return drift;
  }
  return undefined;
}
const active = pack.wells.find((w) => w.id === pack.activeWellId)!;
const sectionEvents = pack.events.filter((e) => pack.sectionOrder.includes(e.wellId));
const call = pack.replay.messages.find((m) => m.topCall)!;
const atCall = pack.replay.ticks[call.tick]!;

function alertsWith(tops = active.tops) {
  return buildAlerts({
    events: sectionEvents,
    wells: pack.wells,
    active,
    activeTops: tops,
    bitMd: atCall.bitMd,
    ropMph: atCall.ropAvg,
    bands: pack.bands,
  }).filter((a) => a.band !== "passed");
}

describe("demo pack", () => {
  it("is the same on every run", () => {
    expect(JSON.stringify(buildDemoPack())).toBe(JSON.stringify(pack));
  });

  it("matches the committed data/demo/field.json and reports.json", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../data/demo");
    const { reports, ...field } = pack;
    expect(driftFrom(JSON.parse(readFileSync(join(dir, "field.json"), "utf8")), JSON.parse(JSON.stringify(field)))).toBeUndefined();
    expect(readFileSync(join(dir, "reports.json"), "utf8")).toBe(`${JSON.stringify(reports)}\n`);
  });

  it("never has one rig on two wells at once", () => {
    const offsets = pack.wells.filter((w) => w.role === "offset");
    for (const a of offsets)
      for (const b of offsets) {
        if (a === b || a.rig !== b.rig) continue;
        const overlap = a.spudDate < b.releaseDate! && b.spudDate < a.releaseDate!;
        expect(overlap, `${a.id} and ${b.id} on ${a.rig}`).toBe(false);
      }
  });

  it("dates every event on the day its report records it", () => {
    for (const e of pack.events) {
      const report = pack.reports.find((r) => r.id === e.source.docId);
      const incident = report?.incidents.find((i) => i.eventId === e.id);
      expect(incident, e.id).toBeDefined();
      expect(incident?.mudWeightPpg, `${e.id} mud`).toBe(e.mudWeightPpg);
    }
  });

  it("calls the Barail top above the bit, one lag time after the bit crossed it", () => {
    expect(call.topCall).toEqual({ formationId: "BCS", md: 2872 });
    expect(atCall.bitMd).toBe(2883);
    expect(atCall.ropAvg).toBe(12);
    expect(atCall.samplesMd).toBeGreaterThanOrEqual(2872);
    expect(pack.replay.ticks[pack.replay.openTick]!.samplesMd).toBeLessThan(2872);
  });
});

describe("hero re-tie", () => {
  const before = alertsWith();
  const after = alertsWith(retie(active, active.tops, call.topCall!));

  it("keeps three alerts inside the Barail Coal-Shale", () => {
    const barail = (list: typeof before) => list.filter((a) => a.projection.formationId === "BCS").map((a) => a.event.wellId);
    expect(barail(before)).toEqual(["KN-117", "KN-109", "KN-104"]);
    expect(barail(after)).toEqual(["KN-117", "KN-109", "KN-104"]);
  });

  it("moves each of them up 38 m", () => {
    before.forEach((a, i) => expect(a.projection.md - after[i]!.projection.md).toBeCloseTo(38, 1));
  });

  it("holds 13 h 30 m through the whole opening of the take", () => {
    for (let tick = pack.replay.openTick; tick < call.tick; tick++) {
      const t = pack.replay.ticks[tick]!;
      const first = buildAlerts({ events: sectionEvents, wells: pack.wells, active, activeTops: active.tops, bitMd: t.bitMd, ropMph: t.ropAvg, bands: pack.bands }).find(
        (a) => a.band !== "passed",
      );
      expect(first?.event.wellId).toBe("KN-117");
      expect(formatHours(first!.hours!)).toBe("13 h 30 m");
    }
  });

  it("takes the KN-117 caving from 13 h 30 m in WATCH to 10 h 20 m in PREPARE", () => {
    expect(formatHours(before[0]!.hours!)).toBe("13 h 30 m");
    expect(before[0]!.band).toBe("watch");
    expect(formatHours(after[0]!.hours!)).toBe("10 h 20 m");
    expect(after[0]!.band).toBe("prepare");
  });

  it("recommends the KN-117 mud weight before the re-tied caving depth", () => {
    const rec = recommend(after, atCall.mudWeightPpg)!;
    expect(rec.lead.event.wellId).toBe("KN-117");
    expect(rec.lines[0]!.text).toBe("Raise mud weight 9.8 → 10.4 ppg before 3,007 m");
  });
});

describe("hero on the parsed reports", () => {
  it("gives the same re-tie numbers from the parser's events as from the generator's", () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), "../../../data/demo/extracted/events.json");
    const parsed = (JSON.parse(readFileSync(file, "utf8")) as (OffsetEvent & { md: number | null })[]).filter(
      (e) => e.md !== null && !e.needsReview && pack.sectionOrder.includes(e.wellId),
    );
    const run = (tops = active.tops) =>
      buildAlerts({ events: parsed, wells: pack.wells, active, activeTops: tops, bitMd: atCall.bitMd, ropMph: atCall.ropAvg, bands: pack.bands }).filter(
        (a) => a.band !== "passed",
      );
    const before = run();
    const after = run(retie(active, active.tops, call.topCall!));
    expect(before[0]!.event.id).toBe("KN-117-E04");
    expect([formatHours(before[0]!.hours!), before[0]!.band]).toEqual(["13 h 30 m", "watch"]);
    expect([formatHours(after[0]!.hours!), after[0]!.band]).toEqual(["10 h 20 m", "prepare"]);
    expect(recommend(after, atCall.mudWeightPpg)!.lines[0]!.text).toBe("Raise mud weight 9.8 → 10.4 ppg before 3,007 m");
  });
});
