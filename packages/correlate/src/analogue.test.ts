import { describe, expect, it } from "vitest";
import { ANALOGUE_WEIGHTS, rankAnalogues } from "./analogue";
import { minimumCurvature } from "./depth";
import type { Bed, FormationTop } from "./types";

const surveys = minimumCurvature([
  { md: 0, inc: 0, azi: 0 },
  { md: 5000, inc: 0, azi: 0 },
]);

const tops = (bcs: number, bms: number): FormationTop[] => [
  { formationId: "TPM", md: 1400, status: "log" },
  { formationId: "BCS", md: bcs, status: "log" },
  { formationId: "BMS", md: bms, status: "log" },
];

const coal = (mdTop: number, mdBase: number): Bed => ({ lithology: "coal", mdTop, mdBase });

const well = (id: string, x: number, bcs: number, bms: number, beds: Bed[] = []) => ({
  id,
  x,
  y: 0,
  rtElevation: 100,
  surveys,
  tops: tops(bcs, bms),
  beds,
});

const active = well("KN-125", 0, 2900, 3500, [coal(3000, 3060)]);
const faults = [{ name: "F1", x: 2000, throwM: 40 }];

describe("rankAnalogues", () => {
  it("scores a geological twin in the same block at the full weight", () => {
    const [twin] = rankAnalogues(active, active.tops, [well("twin", 500, 2900, 3500, [coal(3000, 3060)])], "BCS", faults);
    expect(twin!.score).toBe(1);
    expect(twin!.components).toEqual({ depthDeltaM: 0, isopachDeltaM: 0, sameBlock: true, lithologyDelta: 0 });
    expect(twin!.distanceKm).toBe(0.5);
  });

  it("ranks by geology rather than distance", () => {
    const near = well("near", 300, 2960, 3530, [coal(3000, 3060)]);
    const far = well("far", 1800, 2905, 3505, [coal(3000, 3060)]);
    const ranked = rankAnalogues(active, active.tops, [near, far], "BCS", faults);
    expect(ranked.map((a) => a.wellId)).toEqual(["far", "near"]);
  });

  it("drops the block weight for a well across a fault", () => {
    const [across] = rankAnalogues(active, active.tops, [well("across", 2500, 2900, 3500, [coal(3000, 3060)])], "BCS", faults);
    expect(across!.components.sameBlock).toBe(false);
    expect(across!.score).toBeCloseTo(1 - ANALOGUE_WEIGHTS.block.weight, 6);
  });

  it("halves the depth part at its half-score difference", () => {
    const off = well("deep", 500, 2900 + ANALOGUE_WEIGHTS.depth.halfAtM, 3500 + ANALOGUE_WEIGHTS.depth.halfAtM, [coal(3035, 3095)]);
    const [a] = rankAnalogues(active, active.tops, [off], "BCS", faults);
    expect(a!.score).toBeCloseTo(1 - ANALOGUE_WEIGHTS.depth.weight / 2, 3);
  });

  it("skips an offset that never drilled through the interval instead of throwing", () => {
    const shallow = { ...well("shallow", 500, 2900, 3500), tops: tops(2900, 3500).slice(0, 1) };
    const ranked = rankAnalogues(active, active.tops, [shallow, well("full", 500, 2900, 3500)], "BCS", faults);
    expect(ranked.map((a) => a.wellId)).toEqual(["full"]);
  });

  it("returns nothing when the active well's interval has no base yet", () => {
    expect(rankAnalogues(active, tops(2900, 3500).slice(0, 2), [well("full", 500, 2900, 3500)], "BCS", faults)).toEqual([]);
  });

  it("compares interbeds only once the active well has drilled some", () => {
    const bare = { ...active, beds: [] };
    const [a] = rankAnalogues(bare, bare.tops, [well("coaly", 500, 2900, 3500, [coal(2900, 3200)])], "BCS", faults);
    expect(a!.components.lithologyDelta).toBe(0);
  });
});
