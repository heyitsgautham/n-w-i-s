// Domain types shared by the synthetic pack, the correlation logic and the UI.
// Depth conventions, stated once so nothing downstream guesses:
//   md       measured depth along hole from the well's own rotary table (RT), metres
//   tvd      true vertical depth below the well's own RT, metres
//   tvdss    true vertical depth below mean sea level, metres, positive down
//   display  true vertical depth below the active well's RT, the section's shared axis

export type Lithology =
  | "gravel"
  | "sandy-clay"
  | "clay"
  | "sandstone"
  | "shale"
  | "coal"
  | "siltstone"
  | "limestone"
  | "basement";

export interface Formation {
  id: string;
  name: string;
  /** Short label used on the section where space is tight. */
  short: string;
  lithology: Lithology;
}

export interface SurveyStation {
  md: number;
  /** Inclination from vertical, degrees. */
  inc: number;
  /** Azimuth from grid north, degrees. */
  azi: number;
  tvd: number;
}

/**
 * log        picked from an offset's wireline logs
 * called     picked on the active well while drilling, from cuttings or LWD
 * prognosed  the active well's plan, not yet drilled
 */
export type TopStatus = "log" | "called" | "prognosed";

export interface FormationTop {
  formationId: string;
  md: number;
  status: TopStatus;
}

/** A bed inside a formation that the lithology column draws, such as a coal seam. */
export interface Bed {
  lithology: Lithology;
  mdTop: number;
  mdBase: number;
}

export interface CurveSample {
  md: number;
  value: number;
}

export type WellRole = "active" | "offset";

export interface Well {
  id: string;
  role: WellRole;
  /** Local field grid, metres east and north of the field origin. */
  x: number;
  y: number;
  /** Rotary table elevation above mean sea level, metres. */
  rtElevation: number;
  spudDate: string;
  rig: string;
  /** Deepest measured depth reached so far (offsets: TD; active: hole depth at pack time). */
  tdMd: number;
  surveys: SurveyStation[];
  /** Offsets: interpreted tops from logs. Active: the pre-spud prognosis. */
  tops: FormationTop[];
  beds: Bed[];
  /** Wireline gamma ray. Only the section wells carry it; the section is the only view that draws it. */
  gammaRay: CurveSample[];
  sections: HoleSection[];
  /** Mud weight in use from each depth down, as drilled (offsets) or planned (active). */
  mud: MudStep[];
  /** Days-versus-depth as drilled. For the active well, drilled so far. */
  curve: CurvePoint[];
  /** Active well only: the pre-spud plan, no NPT. */
  planCurve?: CurvePoint[];
  /** Offsets: date the rig was released. */
  releaseDate?: string;
}

export interface HoleSection {
  /** Bit size, inches, as written on the rig: "12¼". */
  sizeIn: string;
  /** Casing run after the section: "9⅝". */
  casingIn: string;
  topMd: number;
  shoeMd: number;
}

export interface MudStep {
  fromMd: number;
  ppg: number;
}

export interface CurvePoint {
  /** Days since spud, fractional. */
  day: number;
  md: number;
}

export type EventKind =
  | "caving"
  | "stuck-pipe"
  | "losses"
  | "tight-hole"
  | "bit-balling"
  | "differential-sticking"
  | "kick";

export interface Lesson {
  kind: "raise-mud-weight" | "wiper-trip" | "limit-static-time";
  /** Mud weight the offset stabilised at, for raise-mud-weight. */
  toPpg?: number;
  /** Static-time limit in minutes, for limit-static-time. */
  minutes?: number;
  /** Why, in the offset's own terms. Quoted on the recommendation card. */
  evidence: string;
  /** Where that sentence sits on the report page, one box per line it spans, PDF points. */
  source?: { page: number; rects: [number, number, number, number][] };
}

export interface EventSource {
  /** Daily drilling report the event is recorded in, e.g. "KN-117-2018-03-04". */
  docId: string;
  /** Page the incident block starts on. Null until the report has been rendered and parsed. */
  page: number | null;
  /** Incident block on that page, PDF points from the top-left: x0, top, x1, bottom. */
  bbox?: [number, number, number, number];
  /** True when the page had no text layer and was read by OCR. */
  ocr?: boolean;
}

export interface OffsetEvent {
  id: string;
  wellId: string;
  kind: EventKind;
  title: string;
  md: number;
  date: string;
  mudWeightPpg: number;
  nptHours: number;
  /** Loss rate, bbl/h, for losses. */
  lossRateBblH?: number;
  narrative: string;
  action: string;
  /** What the report's remarks say to do next time. */
  remarks: string;
  lessons: Lesson[];
  source: EventSource;
  /** Extraction confidence, 0 to 1. Ground-truth events from the generator carry 1. */
  confidence: number;
  /** Below the review threshold and not yet confirmed by a person, so it cannot raise an alert. */
  needsReview?: boolean;
}

export type OpCode = "DRL" | "CIRC" | "TRIP" | "CSG" | "CMT" | "WOC" | "BOP" | "FIT" | "LOG" | "NPT" | "RIG";

export interface OpRow {
  from: string;
  to: string;
  hours: number;
  code: OpCode;
  /** Depth at the end of the row, m MD. */
  md: number;
  text: string;
  eventId?: string;
}

export interface Incident {
  eventId: string;
  kind: EventKind;
  title: string;
  time: string;
  md: number;
  /** Mud weight in the hole when the incident began. */
  mudWeightPpg: number;
  nptHours: number;
  description: string;
  action: string;
  remarks: string;
}

export interface DailyReport {
  id: string;
  wellId: string;
  date: string;
  reportNo: number;
  holeSizeIn: string;
  startMd: number;
  endMd: number;
  endTvd: number;
  summary: string;
  forecast: string;
  ops: OpRow[];
  mud: { weightPpg: number; funnelVisS: number; pv: number; yp: number; fluidLossMl: number; type: string };
  bit: { no: number; sizeIn: string; type: string; depthInMd: number; metres: number; hours: number } | null;
  surveys: SurveyStation[];
  incidents: Incident[];
  /** Set when the report must arrive as a clean scan; otherwise one report in five is scanned by hash. */
  scan?: "clean";
}

export interface TopCall {
  formationId: string;
  md: number;
}

export interface Telemetry {
  tick: number;
  /** ISO timestamp with IST offset. */
  time: string;
  bitMd: number;
  /** Depth whose cuttings are reaching the shakers now, one lag time behind the bit. */
  samplesMd: number;
  ropInstant: number;
  /** Ten-minute average rate of penetration, the rate every ETA uses. */
  ropAvg: number;
  wobTonnes: number;
  rpm: number;
  flowGpm: number;
  mudWeightPpg: number;
}

export type MessageSource = "driller" | "mud-logger";

export interface RigMessage {
  tick: number;
  time: string;
  source: MessageSource;
  text: string;
  /** Present when the message calls a formation top. */
  topCall?: TopCall;
}

export interface Replay {
  wellId: string;
  tickSeconds: number;
  /** Tick the recorded take opens on. */
  openTick: number;
  ticks: Telemetry[];
  messages: RigMessage[];
  /** Depth-indexed ROP for the drilled hole, including history before the replay starts. */
  ropByDepth: CurveSample[];
  /** Lag from bit to shakers, minutes. Samples below the lag depth are still in transit. */
  lagMinutes: number;
  /** LWD gamma-ray sensor offset behind the bit, metres. */
  gammaSensorOffset: number;
  holeSizeIn: string;
}

export interface AlertBands {
  /** ETA at or under this many hours is PREPARE. */
  prepareHours: number;
  /** ETA at or under this many hours is WATCH. Above it is MONITOR. */
  watchHours: number;
}

export interface Fault {
  name: string;
  /** North-south fault trace at this easting, metres. */
  x: number;
  /** Throw at the Barail Coal-Shale top, metres, down to the east. */
  throwM: number;
}

/** Barail Coal-Shale top on a regular grid, for the structure map. */
export interface StructureGrid {
  formationId: string;
  x0: number;
  y0: number;
  step: number;
  nx: number;
  ny: number;
  /** Row-major TVDSS, metres, rounded to 0.1. */
  values: number[];
}

export interface DemoPack {
  seed: number;
  field: {
    name: string;
    area: string;
    datumNote: string;
    /** Latitude and longitude the map places the active well at. Display only; the field is fictional. */
    anchor: { lat: number; lng: number };
  };
  faults: Fault[];
  structure: StructureGrid;
  /** Daily drilling reports for every offset, the input to the DDR renderer. */
  reports: DailyReport[];
  formations: Formation[];
  activeWellId: string;
  /** Wells in section order, west to east. */
  sectionOrder: string[];
  wells: Well[];
  events: OffsetEvent[];
  replay: Replay;
  bands: AlertBands;
}
