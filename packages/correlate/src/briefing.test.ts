import { describe, expect, it } from "vitest";
import { composeBriefing } from "./briefing";
import type { FormationTop, HoleSection, OffsetEvent } from "./types";

const tops = (list: [string, number][]): FormationTop[] => list.map(([formationId, md]) => ({ formationId, md, status: "log" }));

const sections: HoleSection[] = [
  { sizeIn: "17½", casingIn: "13⅜", topMd: 0, shoeMd: 1500 },
  { sizeIn: "12¼", casingIn: "9⅝", topMd: 1500, shoeMd: 3200 },
];

const prognosis = tops([
  ["GRJ", 500],
  ["TPM", 1400],
  ["BCS", 2900],
  ["BMS", 3500],
]);

const offset = (id: string) => ({
  id,
  tops: tops([
    ["GRJ", 480],
    ["TPM", 1380],
    ["BCS", 2880],
    ["BMS", 3480],
  ]),
  sections: [
    { sizeIn: "17½", casingIn: "13⅜", topMd: 0, shoeMd: 1480 },
    { sizeIn: "12¼", casingIn: "9⅝", topMd: 1480, shoeMd: 3180 },
  ],
});

let n = 0;
const event = (over: Partial<OffsetEvent>): OffsetEvent => ({
  id: `e${++n}`,
  wellId: "KN-117",
  kind: "caving",
  title: "",
  md: 3000,
  date: "2018-02-03",
  mudWeightPpg: 9.8,
  nptHours: 4,
  narrative: "",
  action: "",
  remarks: "",
  lessons: [],
  source: { docId: `DDR-${n}`, page: 1 },
  confidence: 0.9,
  ...over,
});

const names: Record<string, string> = { GRJ: "Girujan Clay", TPM: "Tipam Sandstone", BCS: "Barail Coal-Shale", BMS: "Barail Main Sand" };
const compose = (events: OffsetEvent[]) =>
  composeBriefing({ sections, prognosis, offsets: [offset("KN-117"), offset("KN-109")], events, formationName: (id) => names[id] ?? id });

describe("composeBriefing", () => {
  it("lists the formations each hole section crosses on the prognosis", () => {
    const [top, main] = compose([]);
    expect(top!.formations).toEqual(["GRJ", "TPM"]);
    expect(main!.formations).toEqual(["TPM", "BCS"]);
    expect(main!.lines).toEqual([]);
  });

  it("groups events by kind and formation, with counts, median NPT and the mud-weight range", () => {
    const events = [
      event({ nptHours: 2, mudWeightPpg: 9.8 }),
      event({ nptHours: 6, mudWeightPpg: 10.4, wellId: "KN-109", date: "2019-05-01" }),
      event({ nptHours: 9, mudWeightPpg: 10.0 }),
      event({ kind: "losses", md: 2000, lossRateBblH: 40, nptHours: 3, mudWeightPpg: 9.2 }),
    ];
    const main = compose(events)[1]!;
    expect(main.eventCount).toBe(4);
    expect(main.lines[0]!.text).toBe(
      "Coal-shale caving in the Barail Coal-Shale: 3 events in 2 wells, median NPT 6.0 h, at 9.8 to 10.4 ppg.",
    );
    expect(main.lines[0]!.cites[0]!.wellId).toBe("KN-109");
    expect(main.lines[1]!.text).toBe("Losses in the Tipam Sandstone: 1 event in 1 well, median NPT 3.0 h, at 9.2 ppg, 40 bbl/h.");
  });

  it("places an event by the offset's own hole size, not by the active well's depths", () => {
    // At 1490 m the active well is still in 17½ in hole, but KN-117 set that shoe at 1480 m.
    const [top, main] = compose([event({ md: 1490, kind: "tight-hole" })]);
    expect(top!.eventCount).toBe(0);
    expect(main!.eventCount).toBe(1);
  });

  it("leaves out events still waiting for review and wells that are not offsets", () => {
    const main = compose([event({ needsReview: true }), event({ wellId: "KN-999" })])[1]!;
    expect(main.eventCount).toBe(0);
  });

  it("writes one advice line per kind of lesson, quoting the newest offset", () => {
    const lesson = (date: string, toPpg: number) =>
      event({ date, lessons: [{ kind: "raise-mud-weight", toPpg, evidence: `Hole stable at ${toPpg} ppg.` }] });
    const main = compose([lesson("2015-01-01", 10.2), lesson("2018-01-01", 10.4)])[1]!;
    const advice = main.lines.filter((l) => l.id.endsWith("raise-mud-weight"));
    expect(advice).toHaveLength(1);
    expect(advice[0]!.text).toBe('Carry at least 10.4 ppg through the Barail Coal-Shale. KN-117: "Hole stable at 10.4 ppg."');
  });

  it("falls back to an actionable remark when an event has no lesson", () => {
    const main = compose([event({ kind: "stuck-pipe", remarks: "Pipe freed after jarring. Keep the string moving at connections." })])[1]!;
    expect(main.lines.at(-1)!.text).toBe("Keep the string moving at connections. (KN-117, stuck pipe)");
  });
});
