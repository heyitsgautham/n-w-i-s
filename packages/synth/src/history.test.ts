import type { FormationTop } from "@wells/correlate";
import { describe, expect, it } from "vitest";
import { addDays, holeSections, mudAt, mudSchedule, simulate, type SimEvent } from "./history";

const tops: FormationTop[] = [
  ["ALV", 8],
  ["DUP", 150],
  ["GRJ", 470],
  ["TPM", 1400],
  ["BCS", 2900],
  ["BMS", 3500],
  ["KPL", 3980],
].map(([formationId, md]) => ({ formationId: formationId as string, md: md as number, status: "log" }));

const TD = 4200;
const sections = holeSections(tops, TD);

const simEvent = (id: string, md: number, nptHours: number): SimEvent => ({
  id,
  kind: "caving",
  title: "Caving",
  md,
  nptHours,
  narrative: `Cavings at ${md} m.`,
  action: "Raised mud weight.",
  remarks: "",
});

const run = (stopAtMd?: number) =>
  simulate({
    seed: 26121,
    wellId: "KN-T1",
    tops,
    beds: [{ lithology: "coal", mdTop: 3000, mdBase: 3012 }],
    sections,
    events: [simEvent("late", 3100, 6), simEvent("early", 1200, 3)],
    tdMd: TD,
    stopAtMd,
  });

describe("holeSections", () => {
  it("sets each shoe below its formation top and runs the last section to TD", () => {
    expect(sections.map((s) => [s.sizeIn, s.topMd, s.shoeMd])).toEqual([
      ["26", 0, 300],
      ["17½", 300, 1430],
      ["12¼", 1430, 2915],
      ["8½", 2915, TD],
    ]);
  });
});

describe("mud schedule", () => {
  const steps = mudSchedule("KN-T1", sections, tops, [{ md: 3100, mudAfterPpg: 10.8 }]);

  it("starts each section on its program weight and steps up ahead of the Kopili", () => {
    expect(mudAt(steps, 100)).toBe(9.0);
    expect(mudAt(steps, 2000)).toBe(9.8);
    expect(mudAt(steps, 3000)).toBe(10.4);
    expect(mudAt(steps, 3970)).toBe(12.2);
  });

  it("raises the weight just below an event that called for it", () => {
    expect(mudAt(steps, 3100)).toBe(10.4);
    expect(mudAt(steps, 3101)).toBe(10.8);
  });

  it("falls back to 9 ppg with no steps at all", () => {
    expect(mudAt([], 1000)).toBe(9);
  });
});

describe("simulate", () => {
  const sim = run();

  it("is the same for the same seed", () => {
    expect(JSON.stringify(run().ops)).toBe(JSON.stringify(sim.ops));
  });

  it("lays every op end to end in time, with depth never going back", () => {
    expect(sim.ops[0]!.t0).toBe(0);
    for (let i = 1; i < sim.ops.length; i++) {
      const [prev, op] = [sim.ops[i - 1]!, sim.ops[i]!];
      expect(op.t0).toBeCloseTo(prev.t1, 9);
      expect(op.t1).toBeGreaterThanOrEqual(op.t0);
      expect(op.md0).toBeGreaterThanOrEqual(prev.md0);
    }
    expect(sim.endT).toBeCloseTo(sim.ops.at(-1)!.t1, 9);
  });

  it("drills to TD and changes depth only while drilling", () => {
    const deepest = Math.max(...sim.ops.map((o) => o.md1));
    expect(deepest).toBe(TD);
    for (const op of sim.ops) if (op.code !== "DRL") expect(op.md1).toBe(op.md0);
  });

  it("stops for each event at its depth, in depth order, for its full NPT", () => {
    const early = sim.eventT.get("early")!;
    const late = sim.eventT.get("late")!;
    expect(early).toBeLessThan(late);
    for (const id of ["early", "late"]) {
      const npt = sim.ops.filter((o) => o.eventId === id);
      expect(npt.map((o) => o.code)).toEqual(["NPT", "NPT"]);
      expect(npt[0]!.t0).toBe(sim.eventT.get(id));
    }
    const lateNpt = sim.ops.filter((o) => o.eventId === "late");
    expect(lateNpt.reduce((h, o) => h + o.t1 - o.t0, 0)).toBeCloseTo(6, 9);
    expect(lateNpt[0]!.md0).toBe(3100);
  });

  it("runs at least one bit per section, each in that section's size", () => {
    expect(new Set(sim.bits.map((b) => b.sizeIn))).toEqual(new Set(sections.map((s) => s.sizeIn)));
    for (const b of sim.bits) expect(b.depthOut).toBeGreaterThanOrEqual(b.depthIn);
    expect(sim.bits.map((b) => b.no)).toEqual(sim.bits.map((_, i) => i + 1));
  });

  it("stops part way when asked, with no casing run after the stop", () => {
    const partial = run(3050);
    const last = partial.ops.at(-1)!;
    expect(last.code).toBe("DRL");
    expect(last.md1).toBe(3050);
    expect(partial.eventT.has("late")).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses month and leap-year ends in UTC", () => {
    expect(addDays("2016-02-28", 1)).toBe("2016-02-29");
    expect(addDays("2018-12-31", 1)).toBe("2019-01-01");
    expect(addDays("2018-03-01", -1)).toBe("2018-02-28");
  });
});
