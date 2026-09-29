/**
 * Lays the recorded voiceover under the silent film: `pnpm voice`.
 *
 * Put one clip per scene in recording/voice/ as scene-01.wav to scene-16.wav (any format ffmpeg
 * reads, same base names). Each clip starts at its scene's start in storyboard.ts, the clips are
 * mixed and loudness-normalised, and the video stream is copied untouched.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DURATION, SCENES } from "./storyboard";
import { ffmpegPath } from "./tools";

const OUT = join(import.meta.dirname, "out");
const VIDEO = join(OUT, "demo.mp4");
const FINAL = join(OUT, "final.mp4");
const VOICE = join(import.meta.dirname, "voice");

const files = existsSync(VOICE) ? readdirSync(VOICE) : [];
const clips = SCENES.flatMap((s, i) => {
  const name = files.find((f) => f.startsWith(`scene-${String(i + 1).padStart(2, "0")}.`));
  return name ? [{ file: join(VOICE, name), at: s.start, scene: i + 1 }] : [];
});
if (!existsSync(VIDEO)) throw new Error(`no film at ${VIDEO}: run \`pnpm film\` first`);
if (!clips.length) throw new Error(`no clips in ${VOICE}: expected scene-01.wav to scene-${SCENES.length}.wav`);

const args = ["-y", "-loglevel", "error", "-i", VIDEO];
for (const c of clips) args.push("-i", c.file);
const delays = clips.map((c, j) => `[${j + 1}:a]aresample=48000,adelay=${c.at * 1000}|${c.at * 1000}[a${j}]`);
const mix = `${clips.map((_, j) => `[a${j}]`).join("")}amix=inputs=${clips.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad[aout]`;
args.push("-filter_complex", [...delays, mix].join(";"), "-map", "0:v", "-map", "[aout]");
args.push("-c:v", "copy", "-c:a", "aac", "-ac", "2", "-b:a", "192k", "-t", String(DURATION), "-movflags", "+faststart", FINAL);
execFileSync(ffmpegPath(), args, { stdio: "inherit" });

const missing = SCENES.map((_, i) => i + 1).filter((n) => !clips.some((c) => c.scene === n));
console.log(`wrote ${FINAL}, ${clips.length} of ${SCENES.length} lines mixed in${missing.length ? `, missing scenes ${missing.join(", ")}` : ""}`);
