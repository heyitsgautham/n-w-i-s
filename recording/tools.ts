import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The ffmpeg that ships inside the project's Python environment (imageio-ffmpeg), so recording
 * needs nothing installed globally. FFMPEG overrides it.
 */
export function ffmpegPath(): string {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const root = join(import.meta.dirname, "..");
  const python = join(root, ".venv", "bin", "python");
  if (!existsSync(python)) throw new Error("no .venv: run `uv sync --all-packages` first");
  return execFileSync(python, ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
}
