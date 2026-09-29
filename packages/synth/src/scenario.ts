import type { EventKind, Lesson } from "@wells/correlate";

/**
 * The authored hero fixture. Everything the story depends on is fixed here, and the generator
 * builds the rest of the field around it from the seed.
 *
 * The story, checked against the numbers below:
 *   KN-125 is drilling 12¼ in hole. The prognosis puts the Barail top at 2,910 m MD.
 *   The bit crossed 2,872 m 55 minutes ago and ROP halved, a drilling break.
 *   Samples take 54 minutes to reach the shakers, so the call lands with the bit at 2,883 m.
 *   Re-hung from the call, every deeper top moves up 38 m.
 *   The KN-117 caving sits 135 m below the Barail top: 3,045 m before the call, 3,007 m after.
 *   At 12 m/h that is 162 m, 13 h 30 m, before and 124 m, 10 h 20 m, after, so it moves from WATCH to PREPARE.
 */
export const SEED = 26121;

export const FIELD = {
  name: "Kathal Nala",
  area: "Upper Assam shelf, fictional field",
  datumNote: "Section depths are TVD below the KN-125 rotary table",
  /**
   * Where the map draws KN-125 on real satellite imagery: farmland near Tingkhong in Dibrugarh
   * district, south of the Brahmaputra. Every well lands on land, the nearest town is 7.7 km
   * south, and the nearest industrial site is 20 km west. The terrain is real; every well, name and
   * event on it is fictional.
   */
  anchor: { lat: 27.285, lng: 95.075 },
};

export const ACTIVE = {
  id: "KN-125",
  x: 0,
  y: 0,
  rtElevation: 118.4,
  rig: "Rig KD-7",
  plannedTdMd: 4420,
  holeSizeIn: "12¼",
  mudWeightPpg: 9.8,
  /** Tops already drilled and called, m MD. */
  called: { ALV: 8, DUP: 152, GRJ: 474, TPM: 1417 } as Record<string, number>,
  /** The prognosis still ahead of the bit, m MD. */
  prognosed: { BCS: 2910, BMS: 3520, KPL: 3980, SYL: 4300 } as Record<string, number>,
};

/** The four offsets drawn on the correlation section. */
export const SECTION_OFFSETS = [
  { id: "KN-104", x: -3620, y: 1160, spudDate: "2011-03-02", rig: "Rig KD-3", tdMd: 4585 },
  { id: "KN-117", x: -1540, y: -420, spudDate: "2018-01-19", rig: "Rig KD-5", tdMd: 4470 },
  { id: "KN-109", x: 2080, y: 310, spudDate: "2015-10-07", rig: "Rig KD-3", tdMd: 4520 },
  { id: "KN-121", x: 4350, y: -640, spudDate: "2022-04-11", rig: "Rig KD-7", tdMd: 4650 },
];

/** The other twenty offsets. Positions, spud order and rigs come from the seed. */
export const GENERATED_OFFSETS = {
  ids: [101, 102, 103, 105, 106, 107, 108, 110, 111, 112, 113, 114, 115, 116, 118, 119, 120, 122, 123, 124].map((n) => `KN-${n}`),
  /** How many of them fall inside 5 km of KN-125. */
  inside5km: 4,
  innerRadius: [2200, 4800] as [number, number],
  outerRadius: [5600, 10500] as [number, number],
  minSpacing: 900,
  firstYear: 2009,
  lastYear: 2025,
  rigs: ["Rig KD-3", "Rig KD-5", "Rig KD-7", "Rig KD-9"],
  /** Rig move and rig-up between wells, days. */
  rigMoveDays: 9,
};

/** West to east along the section line. */
export const SECTION_ORDER = ["KN-104", "KN-117", "KN-125", "KN-109", "KN-121"];

/** Smooth structure the prognosis was built from. Offsets sample it; KN-125 sits on an unmapped high. */
export const STRUCTURE = {
  /** Metres deeper per metre east and north at full growth. */
  dipEast: 0.004,
  dipNorth: 0.0015,
  anticline: { x: -300, y: 200, sigma: 2500, amplitude: 45 },
  /** North-south normal fault between KN-109 and KN-121, down to the east. */
  fault: { x: 3200, throw: 32, name: "F1" },
  /** Offset residual from the smooth surface, metres, one standard deviation at full growth. */
  residualSd: 3.5,
  grid: { x0: -10000, y0: -8000, step: 250, nx: 81, ny: 65 },
};

/**
 * Casing points. The 20 in goes in the Dupitila, the 13⅜ in just below the Girujan, and the 9⅝ in a
 * few metres into the Barail shale, a competent seat that isolates the Tipam before the coal.
 */
export const HOLE_PROGRAM = [
  { sizeIn: "26", casingIn: "20", shoe: { formationId: "DUP", offsetM: 150 }, mudPpg: 9.0, mudType: "Spud mud" },
  { sizeIn: "17½", casingIn: "13⅜", shoe: { formationId: "TPM", offsetM: 30 }, mudPpg: 9.6, mudType: "WBM, PHPA" },
  { sizeIn: "12¼", casingIn: "9⅝", shoe: { formationId: "BCS", offsetM: 15 }, mudPpg: 9.8, mudType: "WBM, KCl-polymer" },
  { sizeIn: "8½", casingIn: "7 liner", shoe: null, mudPpg: 10.4, mudType: "WBM, KCl-polymer-glycol" },
];

/** Mud weight steps up ahead of the Kopili pressure ramp. */
export const KOPILI_STEP = { aboveTopM: 20, ppg: 12.2 };

/** Offsets that drilled the upper 8½ in with a different weight from the program. */
export const MUD_OVERRIDES: Record<string, Record<string, number>> = {
  "KN-117": { "8½": 9.8 },
  "KN-109": { "8½": 10.2 },
  "KN-104": { "8½": 10.6 },
};

/** Days-versus-depth model. */
export const DRILLING = {
  /** Base ROP by formation, m/h, before the well's own factor and per-stand noise. */
  rop: { ALV: 35, DUP: 30, GRJ: 18, TPM: 25, BCS: 9, BMS: 12, KPL: 6, SYL: 4, LGP: 5 } as Record<string, number>,
  coalRop: 14,
  standM: 28.5,
  connectionH: 0.3,
  tripMph: 350,
  bitLifeM: { "26": 2000, "17½": 900, "12¼": 700, "8½": 380 } as Record<string, number>,
  casingRunMph: 220,
  cementH: 5,
  wocH: 8,
  bopH: 12,
  fitH: 3,
  loggingH: 30,
  spudHour: 6,
};

export const REPLAY = {
  tickSeconds: 10,
  callTime: "2026-09-24T03:12:30+05:30",
  ticksBeforeCall: 360,
  /** Long enough to keep playing through the whole recorded video. */
  ticksAfterCall: 600,
  /** The take opens fifteen ticks before the call, so the call lands fifteen seconds in at 1 tick per second. */
  openTicksBeforeCall: 15,
  call: { formationId: "BCS", md: 2872, spoken: "Barail" },
  bitAtCallMd: 2883,
  ropAbove: 24,
  ropBelow: 12,
  lagMinutes: 54,
  gammaSensorOffset: 9,
  wobTonnes: 16,
  rpm: 120,
  flowGpm: 900,
  cuttings: "shale 60%, sandstone 30%, coal traces",
};

export interface HeroEventSpec {
  id: string;
  wellId: string;
  kind: EventKind;
  title: string;
  formationId: string;
  anchor: "top" | "base";
  /** Metres from the anchor boundary, vertical. */
  offsetM: number;
  mudWeightPpg: number;
  /** Mud weight carried after the event, when the action changed it. */
  mudAfterPpg?: number;
  nptHours: number;
  lossRateBblH?: number;
  narrative: string;
  action: string;
  /** Written the way a drilling supervisor writes remarks. The extractor reads lessons out of these. */
  remarks: string;
  lessons: Lesson[];
}

export const HERO_EVENTS: HeroEventSpec[] = [
  {
    id: "KN-117-E04",
    wellId: "KN-117",
    kind: "caving",
    title: "Coal-shale caving, pack-off",
    formationId: "BCS",
    anchor: "top",
    offsetM: 135,
    mudWeightPpg: 9.8,
    mudAfterPpg: 10.4,
    nptHours: 19.5,
    narrative:
      "Splintery coal-shale cavings over the shakers after 25 min static for a survey. String packed off on the next connection, pump pressure up 350 psi, torque erratic.",
    action: "Worked the string free with circulation, pumped two hi-vis sweeps, raised mud weight to 10.4 ppg and back-reamed the interval.",
    remarks: "Caved at 9.8 ppg, hole stable at 10.4 ppg. Packed off on the first connection after the cavings began, wiper trip before drilling on.",
    lessons: [
      { kind: "raise-mud-weight", toPpg: 10.4, evidence: "Caved at 9.8 ppg, hole stable at 10.4 ppg." },
      { kind: "wiper-trip", evidence: "Packed off on the first connection after the cavings began, wiper trip before drilling on." },
    ],
  },
  {
    id: "KN-109-E06",
    wellId: "KN-109",
    kind: "stuck-pipe",
    title: "Stuck pipe after static survey",
    formationId: "BCS",
    anchor: "top",
    offsetM: 205,
    mudWeightPpg: 10.2,
    nptHours: 36.5,
    narrative: "Could not pick up after 40 min static for a gyro survey. Circulation restricted, cavings bridged above the BHA.",
    action: "Jarred down 26 times, spotted a 60 bbl pipe-freeing pill, freed after 31 h and back-reamed to the shoe.",
    remarks: "Stuck after 40 min static for a survey. Keep the string static under 10 min in the coal-shale.",
    lessons: [{ kind: "limit-static-time", minutes: 10, evidence: "Stuck after 40 min static for a survey." }],
  },
  {
    id: "KN-104-E07",
    wellId: "KN-104",
    kind: "losses",
    title: "Partial losses at the Barail base",
    formationId: "BCS",
    anchor: "base",
    offsetM: 8,
    mudWeightPpg: 10.6,
    nptHours: 11,
    lossRateBblH: 28,
    narrative: "Partial losses of 28 bbl/h near the base of the coal-shale with ECD at 10.9 ppg.",
    action: "Pumped a 40 bbl calcium carbonate pill at 25 ppb and cut flow to 780 gpm. Losses cured after 6 h.",
    remarks: "Losses began with ECD above 10.8 ppg. Hold ECD under 10.8 ppg approaching the Main Sand.",
    lessons: [],
  },
];

/**
 * Background hazard rates per 100 m by formation, after the plan's hazard table.
 * The Barail interval of the four section wells is reserved for the authored events above.
 */
export const HAZARDS: Record<string, { kind: EventKind; per100m: number; title: string }[]> = {
  GRJ: [
    { kind: "tight-hole", per100m: 0.14, title: "Tight hole on trip" },
    { kind: "bit-balling", per100m: 0.08, title: "Bit balling in sticky clay" },
  ],
  TPM: [{ kind: "losses", per100m: 0.06, title: "Partial losses in Tipam sand" }],
  BCS: [
    { kind: "caving", per100m: 0.1, title: "Coal-shale caving, pack-off" },
    { kind: "stuck-pipe", per100m: 0.05, title: "Stuck pipe in coal-shale" },
  ],
  BMS: [{ kind: "differential-sticking", per100m: 0.08, title: "Differential sticking in Main Sand" }],
  KPL: [{ kind: "kick", per100m: 0.22, title: "Kick, gas influx" }],
  SYL: [{ kind: "losses", per100m: 0.3, title: "Losses in fractured limestone" }],
};

export const RESERVED_FOR_SECTION = ["BCS", "BMS"];

/**
 * Reports that arrive as clean scans, whatever the one-in-five draw says. The hero report is one, so
 * the drawer shows OCR reading a page rather than a text layer. Clean means a flatbed scan, not a fax.
 */
export const CLEAN_SCANS = ["KN-117-E04"];
