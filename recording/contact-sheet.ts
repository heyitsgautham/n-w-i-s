/**
 * Pulls a frame every few seconds out of the MP4 and tiles them into contact sheets, for checking
 * the whole video by eye: `pnpm contact-sheet [every-seconds]`. Also prints the file's length and rate.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ffmpegPath } from "./tools";

const every = Number(process.argv[2] ?? 4);
const video = join(import.meta.dirname, "out", "demo.mp4");
const dir = join(import.meta.dirname, "out", "sheets");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const ffmpeg = ffmpegPath();

let info = "";
try {
  execFileSync(ffmpeg, ["-hide_banner", "-i", video], { stdio: "pipe" });
} catch (e) {
  info = String((e as { stderr?: Buffer }).stderr ?? "");
}
const duration = /Duration: ([\d:.]+)/.exec(info)?.[1];
const stream = /Video: ([^\n]+)/.exec(info)?.[1];
console.log(`duration ${duration}\nvideo ${stream}`);

// Timestamp every tile so a problem can be found in the MP4 again.
const label = "drawtext=text='%{pts\\:hms}':x=12:y=12:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6";
const sheet = (filters: string) =>
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", video, "-vf", `fps=1/${every},${filters}scale=640:-1,tile=3x4:padding=6:color=0x020617`, join(dir, "sheet-%02d.png")]);
try {
  sheet(`${label},`);
} catch {
  // Some ffmpeg builds have no drawtext; the tiles are still in time order, `every` seconds apart.
  sheet("");
}
console.log(readdirSync(dir).map((f) => join(dir, f)).join("\n"));
