import type { Formation, Lithology } from "@wells/correlate";

/**
 * Ten-unit Upper Assam shelf column, names after USGS Bulletin 2208-D.
 * Surma is absent across the demo area, as it is over much of the shelf.
 */
export const FORMATIONS: Formation[] = [
  { id: "ALV", name: "Alluvium", short: "Alluvium", lithology: "gravel" },
  { id: "DUP", name: "Dupitila", short: "Dupitila", lithology: "sandy-clay" },
  { id: "GRJ", name: "Girujan Clay", short: "Girujan", lithology: "clay" },
  { id: "TPM", name: "Tipam Sandstone", short: "Tipam", lithology: "sandstone" },
  { id: "BCS", name: "Barail Coal-Shale", short: "Barail C-S", lithology: "shale" },
  { id: "BMS", name: "Barail Main Sand", short: "Barail M-S", lithology: "sandstone" },
  { id: "KPL", name: "Kopili", short: "Kopili", lithology: "shale" },
  { id: "SYL", name: "Sylhet Limestone", short: "Sylhet", lithology: "limestone" },
  { id: "LGP", name: "Langpar", short: "Langpar", lithology: "siltstone" },
  { id: "BSM", name: "Basement", short: "Basement", lithology: "basement" },
];

/**
 * How strongly each surface carries the deep structure, from 0 (flat young cover) to above 1.
 * The anticline and the fault both grow with depth, which is how growth structures look.
 */
export const STRUCTURE_GROWTH: Record<string, number> = {
  ALV: 0,
  DUP: 0.15,
  GRJ: 0.4,
  TPM: 0.7,
  BCS: 1,
  BMS: 1.05,
  KPL: 1.1,
  SYL: 1.15,
  LGP: 1.2,
  BSM: 1.25,
};

/** Interbeds drawn inside each formation, over its background lithology. */
export interface InterbedRule {
  lithology: Lithology;
  /** Mean spacing between beds, metres. */
  spacing: number;
  thickness: [number, number];
}

export const INTERBEDS: Record<string, InterbedRule[]> = {
  DUP: [{ lithology: "sandstone", spacing: 40, thickness: [3, 8] }],
  GRJ: [{ lithology: "siltstone", spacing: 45, thickness: [2, 6] }],
  TPM: [{ lithology: "shale", spacing: 34, thickness: [2, 6] }],
  BCS: [{ lithology: "sandstone", spacing: 70, thickness: [2, 5] }],
  BMS: [{ lithology: "shale", spacing: 32, thickness: [1, 3] }],
  KPL: [{ lithology: "siltstone", spacing: 50, thickness: [2, 5] }],
  SYL: [{ lithology: "shale", spacing: 45, thickness: [1, 3] }],
};

/** Coal seams in the Barail Coal-Shale, metres below its top. They correlate field-wide within a few metres. */
export const BARAIL_COAL_SEAMS = [18, 64, 135, 205, 288, 372, 451, 539];

/** Wireline gamma-ray response by lithology, API units, mean and spread. */
export const GAMMA: Record<Lithology, [number, number]> = {
  gravel: [48, 8],
  "sandy-clay": [82, 10],
  clay: [104, 9],
  sandstone: [46, 9],
  shale: [112, 10],
  coal: [34, 7],
  siltstone: [78, 9],
  limestone: [24, 6],
  basement: [140, 12],
};

/** Typical on-bottom rate of penetration by lithology in the 12¼ in section, m/h. */
export const ROP: Partial<Record<Lithology, number>> = {
  sandstone: 24,
  shale: 12,
  coal: 18,
  siltstone: 16,
  clay: 18,
};
