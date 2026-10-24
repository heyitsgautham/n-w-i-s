import { describe, expect, it } from "vitest";
import { formatHours, bandFor, hoursTo, projectEvent } from "./alerts";
import { mdAtTvd, minimumCurvature, tvdAtMd } from "./depth";
import { retie } from "./tie";
import type { FormationTop, OffsetEvent } from "./types";

const vertical = minimumCurvature([
  { md: 0, inc: 0, azi: 0 },
  { md: 5000, inc: 0, azi: 0 },
]);
const tilted = minimumCurvature([
  { md: 0, inc: 0, azi: 0 },
  { md: 1000, inc: 0, azi: 0 },
  { md: 4000, inc: 3, azi: 45 },
]);

const tops = (list: [string, number][], status: FormationTop["status"] = "log"): FormationTop[] =>
  list.map(([formationId, md]) => ({ formationId, md, status }));

describe("depth conversion", () => {
  it("keeps TVD equal to MD in a vertical hole", () => {
    expect(tvdAtMd({ surveys: vertical }, 2910)).toBeCloseTo(2910, 9);
  });

  it("loses vertical depth once the hole inclines, and inverts cleanly", () => {
    const tvd = tvdAtMd({ surveys: tilted }, 3500);
    expect(tvd).toBeLessThan(3500);
    expect(tvd).toBeGreaterThan(3498);
    expect(mdAtTvd({ surveys: tilted }, tvd)).toBeCloseTo(3500, 6);
  });
});

describe("re-tie", () => {
  const prognosis = [
    ...tops([["TPM", 1417]], "called"),
    ...tops(
      [
        ["BCS", 2910],
        ["BMS", 3520],
        ["KPL", 3980],
      ],
      "prognosed",
    ),
  ];

  it("moves the called top and every deeper top by the same amount", () => {
    const tied = retie({ surveys: vertical }, prognosis, { formationId: "BCS", md: 2872 });
    expect(tied.map((t) => t.md)).toEqual([1417, 2872, 3482, 3942]);
    expect(tied.find((t) => t.formationId === "BCS")?.status).toBe("called");
    expect(tied.find((t) => t.formationId === "BMS")?.status).toBe("prognosed");
  });

  it("refuses a call for a formation the prognosis does not have", () => {
    expect(() => retie({ surveys: vertical }, prognosis, { formationId: "SYL", md: 4200 })).toThrow();
  });
});

describe("projection by formation", () => {
  const offset = {
    surveys: vertical,
    tops: tops([
      ["TPM", 1400],
      ["BCS", 2950],
      ["BMS", 3600],
    ]),
  };
  const activeTops = tops([
    ["TPM", 1417],
    ["BCS", 2910],
    ["BMS", 3520],
  ]);
  const event = (md: number): OffsetEvent => ({
    id: "E",
    wellId: "X",
    kind: "caving",
    title: "",
    md,
    date: "2018-01-01",
    mudWeightPpg: 9.8,
    nptHours: 1,
    narrative: "",
    action: "",
    remarks: "",
    lessons: [],
    source: { docId: "X-2018-01-01", page: 1 },
    confidence: 1,
  });

  it("measures an upper event from the top", () => {
    const p = projectEvent(event(3085), offset, { surveys: vertical }, activeTops);
    expect(p).toMatchObject({ formationId: "BCS", anchor: "top" });
    expect(p?.md).toBeCloseTo(3045, 6);
  });

  it("measures a lower event from the base, so a thinner formation keeps it at the base", () => {
    const p = projectEvent(event(3592), offset, { surveys: vertical }, activeTops);
    expect(p).toMatchObject({ formationId: "BCS", anchor: "base" });
    expect(p?.md).toBeCloseTo(3512, 6);
  });
});

describe("time to hazard", () => {
  const bands = { prepareHours: 12, watchHours: 24 };

  it("reads hours and minutes the way the rig says them, to ten minutes", () => {
    expect(formatHours(13.5)).toBe("13 h 30 m");
    expect(formatHours(124 / 12)).toBe("10 h 20 m");
    expect(formatHours(123.8 / 12)).toBe("10 h 20 m");
    expect(formatHours(9 + 2 / 60)).toBe("9 h 00 m");
    expect(formatHours(59.9 / 60)).toBe("1 h 00 m");
  });

  it("bands by the hours left, and marks what the bit has passed", () => {
    expect(bandFor(hoursTo(2883, 3045, 12), bands)).toBe("watch");
    expect(bandFor(hoursTo(2883, 3007, 12), bands)).toBe("prepare");
    expect(bandFor(hoursTo(2883, 3512, 12), bands)).toBe("monitor");
    expect(bandFor(hoursTo(2883, 2800, 12), bands)).toBe("passed");
  });
});
