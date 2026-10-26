import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import type { FilmApi } from "./overlays";
import { DURATION, FPS } from "./storyboard";
import { ffmpegPath } from "./tools";

/** The frame-by-frame recorder: clock stepping, screenshots into ffmpeg, cursor, camera and ring. */

export const OUT = join(import.meta.dirname, "out");
export const FROM = Number(process.env.FILM_FROM || 0);
export const TO = Number(process.env.FILM_TO || DURATION);
export const STILLS = process.env.FILM_STILLS === "1";
export const VIEW = { width: 1600, height: 900 };
const FRAME_MS = 1000 / FPS;
const LOWER_THIRD_UNTIL = 6;

type Rect = { x: number; y: number; w: number; h: number };
type Cam = { z: number; tx: number; ty: number };

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export class Film {
  frame = 0;
  private ffmpeg;
  private cursor = { x: 1060, y: 520 };
  private cam: Cam = { z: 1, tx: 0, ty: 0 };
  private ring: { selector: string | null; opacity: number; target: number; pad: number } = { selector: null, opacity: 0, target: 0, pad: 6 };
  lowerThird = true;
  card = 0;
  /** While true the page's clock runs in real time and frames are not stepped. */
  live = false;
  /** Runs before each frame is shot, with whether that frame is being recorded. */
  hook: ((record: boolean) => Promise<void>) | null = null;

  constructor(
    private page: Page,
    file: string,
  ) {
    const scale = "scale=1920:1080:flags=lanczos,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p";
    this.ffmpeg = spawn(
      ffmpegPath(),
      [
        "-y",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        String(FPS),
        "-c:v",
        "mjpeg",
        "-i",
        "-",
        "-vf",
        scale,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "16",
        "-tune",
        "stillimage",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
        "-r",
        String(FPS),
        "-movflags",
        "+faststart",
        file,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
  }

  get t() {
    return this.frame / FPS;
  }

  private call(fn: string, ...args: number[]) {
    return this.page.evaluate(([f, a]) => (window as unknown as FilmApi).__film[f as string]!(...(a as number[])), [fn, args] as const);
  }

  /** Lets React commit what the clock just released. React schedules on MessageChannel, which is not faked. */
  private async settle() {
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let n = 0;
          const c = new MessageChannel();
          c.port1.onmessage = () => (++n >= 3 ? resolve() : c.port2.postMessage(null));
          c.port2.postMessage(null);
        }),
    );
  }

  private async overlays() {
    const lt = this.lowerThird ? Math.max(0, Math.min(1, (LOWER_THIRD_UNTIL - this.t) / 0.4)) : 0;
    await this.call("lower", lt);
    await this.call("card", this.card);
    const r = this.ring;
    r.opacity += Math.sign(r.target - r.opacity) * Math.min(Math.abs(r.target - r.opacity), 1 / 7);
    if (r.selector && r.opacity > 0) {
      const b = await this.page.locator(r.selector).first().boundingBox();
      if (b) await this.call("ring", b.x - r.pad, b.y - r.pad, b.width + 2 * r.pad, b.height + 2 * r.pad, r.opacity);
    } else {
      await this.call("ring", 0, 0, 0, 0, 0);
    }
  }

  get recording() {
    return this.t >= FROM && this.t < TO;
  }

  async shot() {
    if (this.hook) await this.hook(this.recording);
    if (!this.live) {
      await this.page.clock.runFor(FRAME_MS);
      await this.page.evaluate((ms) => (window as unknown as FilmApi).__stepAnimations(ms), FRAME_MS);
    }
    await this.settle();
    await this.overlays();
    if (this.recording) {
      const buf = await this.capture();
      if (!this.ffmpeg.stdin.write(buf)) await new Promise((r) => this.ffmpeg.stdin.once("drain", r));
      if (STILLS && this.frame % FPS === 0) writeFileSync(join(OUT, "stills", `${String(Math.round(this.t)).padStart(3, "0")}.jpg`), buf);
    }
    this.frame++;
  }

  /** A frame of the page. A busy machine can stall the renderer, so a slow frame is retried, not fatal. */
  private async capture(): Promise<Buffer> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.page.screenshot({ type: "jpeg", quality: 92, timeout: 120_000 });
      } catch (e) {
        if (attempt >= 3) throw e;
        console.log(`frame ${this.frame}: screenshot attempt ${attempt} timed out, retrying`);
      }
    }
  }

  async frames(n: number) {
    for (let i = 0; i < n; i++) await this.shot();
  }

  /** Holds until a storyboard time. Fails loudly if a beat overran, so timings never drift. */
  async until(seconds: number) {
    const target = Math.round(seconds * FPS);
    if (this.frame > target) throw new Error(`overran ${seconds}s by ${((this.frame - target) / FPS).toFixed(2)}s`);
    await this.frames(target - this.frame);
  }

  // Pointer

  private async setCursor(x: number, y: number) {
    this.cursor = { x, y };
    await this.page.mouse.move(x, y);
    await this.call("cursor", x, y);
  }

  async hideCursor() {
    await this.call("cursor", -200, -200);
  }

  async showCursor(x: number, y: number) {
    await this.setCursor(x, y);
  }

  async move(x: number, y: number, seconds = 0.7) {
    const from = { ...this.cursor };
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= n; i++) {
      const e = ease(i / n);
      await this.setCursor(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
      await this.shot();
    }
  }

  async box(selector: string) {
    const b = await this.page.locator(selector).first().boundingBox();
    if (!b) throw new Error(`no box for ${selector}`);
    return b;
  }

  async moveTo(selector: string, seconds = 0.7, dx = 0, dy = 0) {
    const b = await this.box(selector);
    await this.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, seconds);
  }

  /** Points at a box from its left edge, clear of whatever it says. */
  async pointAt(selector: string, seconds = 0.7) {
    const b = await this.box(selector);
    await this.move(b.x - 16, b.y + Math.min(b.height / 2, 22), seconds);
  }

  async click(waitFor?: () => Promise<unknown>) {
    await this.page.mouse.down();
    await this.page.mouse.up();
    if (waitFor) await waitFor();
    await this.settle();
    for (let i = 0; i <= 9; i++) {
      await this.call("ripple", this.cursor.x, this.cursor.y, i / 9);
      if (i < 9) await this.shot();
    }
  }

  // Camera

  /** A selector's box as laid out with no zoom, whatever the camera is doing now. */
  async layoutRect(selector: string): Promise<Rect> {
    const b = await this.box(selector);
    const { z, tx, ty } = this.cam;
    return { x: (b.x - tx) / z, y: (b.y - ty) / z, w: b.width / z, h: b.height / z };
  }

  private framing(cx: number, cy: number, z: number): Cam {
    const { width: W, height: H } = VIEW;
    const tx = Math.min(0, Math.max(W - W * z, W / 2 - cx * z));
    const ty = Math.min(0, Math.max(H - H * z, H / 2 - cy * z));
    return { z, tx, ty };
  }

  /** An eased edit zoom onto a point of the unzoomed layout, or back to the full frame. */
  async camera(to: { cx: number; cy: number; z: number } | null, seconds = 0.9, easing = ease) {
    const from = { ...this.cam };
    const target = to ? this.framing(to.cx, to.cy, to.z) : { z: 1, tx: 0, ty: 0 };
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= n; i++) {
      const e = easing(i / n);
      this.cam = { z: from.z + (target.z - from.z) * e, tx: from.tx + (target.tx - from.tx) * e, ty: from.ty + (target.ty - from.ty) * e };
      await this.call("view", this.cam.z, this.cam.tx, this.cam.ty);
      await this.shot();
    }
  }

  async zoomOn(selector: string, z: number, seconds = 0.9, dx = 0, dy = 0) {
    const r = await this.layoutRect(selector);
    await this.camera({ cx: r.x + r.w / 2 + dx, cy: r.y + r.h / 2 + dy, z }, seconds);
  }

  /** Scrolls a scrolling element smoothly so `selector` sits `offset` px below its top. */
  async scrollTo(container: string, selector: string, seconds = 1, offset = 24) {
    const [from, to] = await this.page.evaluate(
      ([c, s, o]) => {
        const box = document.querySelector(c as string)!;
        const el = document.querySelector(s as string)!;
        const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - (o as number);
        return [box.scrollTop, Math.min(top, box.scrollHeight - box.clientHeight)];
      },
      [container, selector, offset] as const,
    );
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= n; i++) {
      const y = from + (to - from) * ease(i / n);
      await this.page.evaluate(([c, v]) => (document.querySelector(c as string)!.scrollTop = v as number), [container, y] as const);
      await this.shot();
    }
  }

  ringOn(selector: string, pad = 6) {
    this.ring = { ...this.ring, selector, target: 1, pad };
  }

  ringOff() {
    this.ring.target = 0;
  }

  async close() {
    this.ffmpeg.stdin.end();
    await new Promise((r) => this.ffmpeg.on("close", r));
  }
}
