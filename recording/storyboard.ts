/**
 * The video: one example, alert 1 on KN-125, followed from the mud-logger call to the KN-117 report
 * page and back to what the engineer should do. The film script plays these timings to the frame,
 * and `voiceover.md` is written from this table, so the lines and the MP4 cannot drift apart.
 * Every number a line speaks is on screen, digit for digit, while it is spoken; film.ts checks them.
 */
export interface Scene {
  id: string;
  start: number;
  end: number;
  screen: string;
  line: string;
}

export const FPS = 30;

export const SCENES: Scene[] = [
  {
    id: "open",
    start: 0,
    end: 7,
    screen: "Correlation section, KN-125 drilling in Tipam, four offsets tied, three alerts ahead. Lower third: N-W-I-S, Oil India, Team 1",
    line: "KN-125, drilling in Upper Assam. What did the wells around it hit, and how far ahead?",
  },
  {
    id: "alert",
    start: 7,
    end: 12,
    screen: "Zoom on alert 1: coal-shale caving, KN-117, 13 h 30 m, WATCH",
    line: "First, the coal-shale caving that hit KN-117, thirteen hours thirty ahead.",
  },
  {
    id: "call",
    start: 12,
    end: 19,
    screen: "Zoom on KN-125: Barail top prognosed at 2,910 m. At 0:15 the mud logger calls it at 2,872 m and the section re-ties",
    line: "The plan put the Barail top at 2,910 metres. Then the mud logger calls it at 2,872.",
  },
  {
    id: "retie",
    start: 19,
    end: 26,
    screen: "Full section after the re-tie: −38 m on KN-125, tie lines pivoted, all three alerts moved up",
    line: "N-W-I-S re-ties the section, and all three alerts move up 38 metres with the formation.",
  },
  {
    id: "flip",
    start: 26,
    end: 32,
    screen: "Zoom on alert 1: 10 h 20 m, PREPARE, 13 h 30 m struck through",
    line: "The caving is now ten hours twenty away, and it moves from watch to prepare.",
  },
  {
    id: "source",
    start: 32,
    end: 38,
    screen: "Click alert 1. The drawer opens on DDR KN-117-2018-02-03, page 1, 3 Feb 2018",
    line: "Click it for the source: KN-117's report, third of February 2018, page one.",
  },
  {
    id: "sentence",
    start: 38,
    end: 45,
    screen: "Zoom on the incident. Highlighted: “Caved at 9.8 ppg, hole stable at 10.4 ppg.”",
    line: "They caved at 9.8 ppg and held at 10.4. That sentence is highlighted.",
  },
  {
    id: "confidence",
    start: 45,
    end: 51,
    screen: "Zoom on extraction confidence 0.99, read from the page's text layer",
    line: "It was read at 0.99 confidence, and you can check it instead of trusting it.",
  },
  {
    id: "action",
    start: 51,
    end: 63,
    screen: "Back on the section, zoom on the recommendation: raise mud weight 9.8 → 10.4 ppg before 3,007 m, wiper trip before 3,007 m",
    line: "So before the bit gets there, raise the mud weight from 9.8 to 10.4 ppg before 3,007 metres, and make a wiper trip first.",
  },
  {
    id: "change",
    start: 63,
    end: 73,
    screen: "Full section, re-tied, the rig-floor log showing the N-W-I-S re-tie line",
    line: "Today engineers redo this correlation in their heads every time the geology surprises them. N-W-I-S redoes it the moment the call comes in.",
  },
  {
    id: "card",
    start: 73,
    end: 79,
    screen: "End card: N-W-I-S, Oil India Limited, Team 1, Saveetha Engineering College, working prototype on synthetic data",
    line: "N-W-I-S, a working prototype on synthetic Upper Assam data, by Team 1, Saveetha Engineering College.",
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
Numbers take longer to say than to write, so the spoken pace runs a little higher; cut words rather than rush.

Every number in a line is on screen, digit for digit, while it is spoken.
This file is generated from \`recording/storyboard.ts\`, the same table the film script plays, so the timings match the MP4.

| Start | End | On screen | Line | Words · wpm |
|---|---|---|---|---|
${rows}
`;
}
