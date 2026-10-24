/**
 * The video: one well, KN-125, from the engineer opening it to the decision it changes, then what
 * else N-W-I-S does and how we built it. The film script plays these timings to the frame, and
 * `voiceover.md` is written from this table, so the lines and the MP4 cannot drift apart.
 *
 * Every number a line speaks comes from the same files the screens read, and film.ts checks that it
 * is on screen, digit for digit, while it is spoken.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Scene {
  id: string;
  start: number;
  end: number;
  screen: string;
  line: string;
}

export const FPS = 30;

const ROOT = join(import.meta.dirname, "..");
const json = <T>(path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;

interface Stats {
  documents: number;
  needsReview: number;
  accuracy: { found: number; truthEvents: number };
}
interface Volve {
  reports: number;
  hazardActivities: number;
  handCheck: { sample: number; right: number };
}
interface Field {
  wells: { role: string; x: number; y: number }[];
}

const stats = json<Stats>("data/demo/extracted/stats.json");
const volve = json<Volve>("data/volve/metrics.json");
const prior = json<{ repos: number }>("data/prior-work.json");
const field = json<Field>("data/demo/field.json");
const hero = json<{ id: string; confidence: number }[]>("data/demo/extracted/events.json").find((e) => e.id === "KN-117-E04")!;

const n = (v: number) => v.toLocaleString("en-US");

/** The numbers the voiceover speaks, as the screens show them. film.ts checks each one on screen. */
export const SPOKEN = {
  inside: field.wells.filter((w) => w.role === "offset" && Math.hypot(w.x, w.y) <= 5000).length,
  reports: n(stats.documents),
  found: stats.accuracy.found,
  planted: stats.accuracy.truthEvents,
  waiting: stats.needsReview,
  confidence: hero.confidence.toFixed(2),
  volveReports: n(volve.reports),
  volveHazards: n(volve.hazardActivities),
  volveRight: volve.handCheck.right,
  volveSample: volve.handCheck.sample,
  repos: prior.repos,
};
const S = SPOKEN;

/** The arrival starts this many seconds into the film, the moment "Open well" is pressed. */
export const ARRIVAL_AT = 5;

export const SCENES: Scene[] = [
  {
    id: "home",
    start: 0,
    end: 6,
    screen: "N-W-I-S home, one field. KN-125 is typed and Open well pressed. Lower third: N-W-I-S, Oil India, Team 1",
    line: "KN-125 is drilling tonight. The engineer opens it.",
  },
  {
    id: "fly",
    start: 6,
    end: 17,
    screen:
      "Google 3D satellite. East along the Himalaya from the Ganga plain, down the Brahmaputra valley to the field. Caption: India's first oil well, 1867, USGS Bulletin 2208-D",
    line: "Along the Himalaya, into Upper Assam, on the south bank of the Brahmaputra, where India's first oil well was drilled in 1867.",
  },
  {
    id: "field",
    start: 17,
    end: 41,
    screen: `25 wells on real terrain, the 5 km ring, ${S.inside} offsets inside it lit. Report pages lift off every offset, a scan line reads them, and they fold into incident chips. Counter: 24 offset wells, ${S.reports} reports, ${S.found} incidents`,
    line: `Inside 5 kilometres, ${S.inside} older wells have drilled through the same rock. Everything they learned is in daily drilling reports, many of them scanned paper. N-W-I-S reads all ${S.reports}, and pulls out ${S.found} incidents, each tied to its well, its depth and its page.`,
  },
  {
    id: "slice",
    start: 41,
    end: 57,
    screen:
      "The camera lines up on A to A'. The five wells step onto the line, the ground tilts away, the section swings down under it, and each chip falls into its layer. It lands on the console",
    line: "Take the five wells along this line and cut the ground open. Each colour is a layer of rock, and every incident falls into the layer it happened in.",
  },
  {
    id: "alert",
    start: 57,
    end: 73,
    screen: "The correlation section in the console. Zoom on alert 1: coal-shale caving, KN-117, 13 h 30 m, WATCH",
    line: "Every problem the neighbours hit is carried across to our well, layer by layer. Ahead of the bit, KN-117's hole caved in. We reach it in 13 hours 30 minutes.",
  },
  {
    id: "call",
    start: 73,
    end: 86,
    screen: "Zoom on KN-125: Barail top prognosed at 2,910 m. At 1:22 the mud logger calls it at 2,872 m, 03:12, and the section re-ties",
    line: "The plan says this coal-shale layer starts at 2,910 metres. At 3:12 in the morning, the mud logger finds coal in the rock chips at 2,872.",
  },
  {
    id: "retie",
    start: 86,
    end: 106,
    screen:
      "Full section after the re-tie: −38 m on KN-125, tie lines pivoted, all three alerts moved up. Zoom on alert 1: 10 h 20 m, PREPARE, 13 h 30 m struck through",
    line: "That is 38 metres early. N-W-I-S re-ties the section at once. The layer moves up, and every hazard inside it moves up too. The caving is now 10 hours 20 minutes away, and the alert goes from watch to prepare.",
  },
  {
    id: "change",
    start: 106,
    end: 117,
    screen: "Full section, re-tied, and the rig-floor line where N-W-I-S reports the re-tie",
    line: "Today an engineer redoes this in their head, every time the rock surprises them. N-W-I-S does it the moment the call comes in.",
  },
  {
    id: "source",
    start: 117,
    end: 132,
    screen:
      "Click alert 1. The drawer opens on DDR KN-117-2018-02-03, 3 Feb 2018, a scanned page. A scan line runs down it and Tesseract's word boxes light up",
    line: "Click the alert and N-W-I-S opens the page it came from. KN-117's report, 3 February 2018. A scanned page, read by our OCR, word by word.",
  },
  {
    id: "sentence",
    start: 132,
    end: 147,
    screen: `Zoom on the highlighted sentence, "Caved at 9.8 ppg, hole stable at 10.4 ppg.", then on extraction confidence ${S.confidence}`,
    line: `The line that matters. Caved at 9.8 ppg, hole stable at 10.4. Read at ${S.confidence} confidence, so the engineer can check it.`,
  },
  {
    id: "ingest",
    start: 147,
    end: 162,
    screen: `Ingestion: ${S.reports} daily reports, ${S.found} of ${S.planted} planted incidents found, ${S.waiting} waiting for review`,
    line: `Across all ${S.reports} reports, it found ${S.found} of our ${S.planted} planted incidents. Anything unsure waits for a person before it raises an alert.`,
  },
  {
    id: "volve",
    start: 162,
    end: 179,
    screen: `The Equinor Volve card: ${S.volveReports} real daily reports, ${S.volveHazards} hazards found, ${S.volveRight} of ${S.volveSample} right by hand`,
    line: `We ran the same rules on ${S.volveReports} real drilling reports from Equinor's Volve field in the North Sea. They found ${S.volveHazards} hazards. ${S.volveRight} of the ${S.volveSample} we checked by hand were right.`,
  },
  {
    id: "action",
    start: 179,
    end: 194,
    screen: "Back on the section, zoom on the recommendation: raise mud weight 9.8 → 10.4 ppg before 3,007 m, wiper trip before 3,007 m",
    line: "N-W-I-S passes on what the neighbours learned. Raise the mud weight from 9.8 to 10.4 ppg before 3,007 metres, and make a wiper trip first.",
  },
  {
    id: "more",
    start: 194,
    end: 207,
    screen: "Four seconds each: Search answering a plain-English question, Compare with the drilling curves, Briefing with its cited lines",
    line: "The same memory answers plain-English questions, compares drilling curves, and writes the pre-spud offset review, every line cited.",
  },
  {
    id: "research",
    start: 207,
    end: 227,
    screen: `How we built N-W-I-S: the statement's seven asks ticked one by one, the sources we read, and ${S.repos} public repos checked`,
    line: `We started from the seven things Oil India asked for, and each one is on screen. We read the USGS survey of Assam's geology, published drilling work from north-east India, and real drilling reports, and checked ${S.repos} public repos before designing ours.`,
  },
  {
    id: "card",
    start: 227,
    end: 235,
    screen: "End card: N-W-I-S, Oil India Limited, Team 1, Saveetha Engineering College, working prototype on synthetic data",
    line: "N-W-I-S. A working prototype on synthetic Upper Assam data, by Team 1, Saveetha Engineering College.",
  },
];

export const DURATION = SCENES[SCENES.length - 1]!.end;

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function voiceoverMarkdown(): string {
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const words = SCENES.reduce((n, s) => n + wordCount(s.line), 0);
  const rows = SCENES.map((s) => {
    const wpm = Math.round((wordCount(s.line) / (s.end - s.start)) * 60);
    return `| ${mmss(s.start)} | ${mmss(s.end)} | ${s.screen} | ${s.line} | ${wordCount(s.line)} · ${wpm} |`;
  }).join("\n");
  return `# Voiceover, N-W-I-S demo video

Read against \`recording/out/demo.mp4\` (${mmss(DURATION)}, 1920 by 1080, 30 fps, no audio).
Each line starts at its start time and should end before its end time.
${words} words over ${mmss(DURATION)}, ${Math.round((words / DURATION) * 60)} words a minute counted as written.
Numbers take longer to say than to write, so the spoken pace runs a little higher; leave the pauses in rather than rush.

Every number in a line is on screen, digit for digit, while it is spoken.
This file is generated from \`recording/storyboard.ts\`, the same table the film script plays, so the timings match the MP4.

| Start | End | On screen | Line | Words · wpm |
|---|---|---|---|---|
${rows}
`;
}
