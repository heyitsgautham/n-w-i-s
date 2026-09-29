/**
 * Records the demo video from recording/storyboard.ts: KN-125 opened from the home screen, the
 * arrival over Google's 3D satellite map, then the section, the call, the report page, the parser's
 * record, the Volve run, the other screens and how we built it.
 *
 * Two clocks. From the home screen to the end of the arrival the page's clock runs in real time,
 * because the 3D map renders on it; the arrival itself is a pure function of film time, driven
 * through `window.__arrival.at(t)`, and every frame waits for the map to finish loading its tiles.
 * From the section on, the page runs on Playwright's fake clock and every frame is stepped by hand:
 * the replay ticks, the re-tie and every CSS animation advance exactly 1/30 s per frame, however
 * long a screenshot takes. The same script produces the same video on any machine.
 *
 * It lays the app out at 1600x900 and renders it at a 1.2 device scale, so the frame comes out at
 * exactly 1920x1080 with text drawn at full resolution and nothing rescaled.
 * Edit zooms are CSS transforms on the page, so zoomed text is re-rendered sharp, not upscaled.
 * The cursor, the ring, the lower third and the end card are drawn by this script, outside the app.
 *
 *   pnpm dev            # API on 8121, web on WEB_PORT or 3000; the Google key needs localhost:3000
 *   pnpm film           # writes recording/out/demo.mp4 and recording/voiceover.md
 *
 * Options: WELLS_URL (web), WELLS_API_URL (API), FILM_FROM / FILM_TO in seconds to render a slice,
 * FILM_STILLS=1 to also save one still per second.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { T as ARRIVAL } from "../apps/web/src/lib/arrival";
import { BASE_URL } from "./stage";
import { ARRIVAL_AT, DURATION, FPS, SCENES, SPOKEN, voiceoverMarkdown } from "./storyboard";
import { ffmpegPath } from "./tools";

const HERE = import.meta.dirname;
const OUT = join(HERE, "out");
const API = process.env.WELLS_API_URL ?? "http://127.0.0.1:8121";
const FROM = Number(process.env.FILM_FROM ?? 0);
const TO = Number(process.env.FILM_TO ?? DURATION);
const STILLS = process.env.FILM_STILLS === "1";
const FRAME_MS = 1000 / FPS;
const VIEW = { width: 1600, height: 900 };
const LOWER_THIRD_UNTIL = 6;
/** Title-card text. Neutral by default; FILM_BRAND, FILM_TAGLINE and FILM_LABEL put the submission's own on the cards. */
const BRAND = process.env.FILM_BRAND ?? "N-W-I-S";
const TAGLINE = process.env.FILM_TAGLINE ?? "Offset-well memory";
const LABEL = (process.env.FILM_LABEL ?? "Oil India Limited").toUpperCase();

mkdirSync(OUT, { recursive: true });
writeFileSync(join(HERE, "voiceover.md"), voiceoverMarkdown());

/** Everything the film draws over the app. Nothing here ships in the product. */
const OVERLAYS = `
(() => {
  const el = (id, css, html = "") => {
    let e = document.getElementById(id);
    if (!e) {
      e = document.createElement("div");
      e.id = id;
      e.style.cssText = "position:fixed;pointer-events:none;" + css;
      e.innerHTML = html;
      document.documentElement.append(e);
    }
    return e;
  };
  const font = "font-family:var(--font-barlow),sans-serif;";
  const mark = '<svg width="76" height="76" viewBox="0 0 26 26"><rect x="1" y="4" width="24" height="5" fill="#eadb8c" opacity=".85"/><rect x="1" y="10.5" width="24" height="5" fill="#8ea894" opacity=".85"/><rect x="1" y="17" width="24" height="5" fill="#a8cbe6" opacity=".85"/><path d="M13 1V21" stroke="#020617" stroke-width="3"/><path d="M13 1V20" stroke="#f8fafc" stroke-width="1.4"/><path d="M10.5 19.5H15.5L13 23.5Z" fill="#f8fafc"/></svg>';
  window.__film = {
    cursor(x, y) {
      el("film-cursor", "left:0;top:0;z-index:2147483646;",
        '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 23 L8.5 18 L12.5 27 L16 25.5 L12 16.8 L19.5 16.8 Z" fill="#f8fafc" stroke="#020617" stroke-width="1.6" stroke-linejoin="round"/></svg>'
      ).style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)";
    },
    ripple(x, y, t) {
      const r = el("film-ripple", "left:0;top:0;z-index:2147483645;border:2px solid #f8fafc;border-radius:999px;");
      const size = 10 + 34 * t;
      r.style.width = r.style.height = size + "px";
      r.style.transform = "translate(" + (x - size / 2) + "px," + (y - size / 2) + "px)";
      r.style.opacity = t >= 1 ? "0" : String(0.85 * (1 - t));
    },
    ring(x, y, w, h, o) {
      const r = el("film-ring", "left:0;top:0;z-index:2147483640;border:2px solid rgba(248,250,252,.95);border-radius:7px;box-shadow:0 0 0 4px rgba(2,6,23,.55),0 0 26px rgba(248,250,252,.28);");
      r.style.transform = "translate(" + x + "px," + y + "px)";
      r.style.width = w + "px";
      r.style.height = h + "px";
      r.style.opacity = String(o);
    },
    lower(o) {
      el("film-lower", "left:92px;bottom:52px;z-index:2147483641;padding:14px 22px 15px 18px;background:rgba(2,6,23,.92);border-left:3px solid #f8fafc;box-shadow:0 12px 32px rgba(0,0,0,.5);color:#e2e8f0;" + font,
        '<div style="display:flex;align-items:baseline;gap:12px"><span style="font-weight:700;font-size:30px;letter-spacing:.14em;color:#f8fafc">${BRAND}</span><span style="font-size:18px;color:#cbd5e1">${TAGLINE}</span></div>' +
        '<div style="margin-top:7px;font-size:13.5px;font-weight:600;letter-spacing:.12em;color:#94a3b8">${LABEL} · TEAM 1, SAVEETHA ENGINEERING COLLEGE</div>'
      ).style.opacity = String(o);
    },
    card(o) {
      el("film-card", "inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;" + font,
        '<div style="display:flex;align-items:center;gap:46px">' + mark +
        '<div><div style="font-size:20px;font-weight:600;letter-spacing:.16em;color:#94a3b8">${LABEL}</div>' +
        '<div style="margin-top:12px;font-size:128px;line-height:.9;font-weight:700;letter-spacing:.05em;color:#f8fafc">${BRAND}</div>' +
        '<div style="margin-top:12px;font-size:40px;color:#e2e8f0">${TAGLINE}</div>' +
        '<div style="margin-top:34px;font-size:27px;color:#cbd5e1">Team 1 · Saveetha Engineering College</div>' +
        '<div style="margin-top:24px;display:inline-flex;align-items:center;gap:12px;padding:11px 20px;border:1px solid rgba(148,163,184,.5);border-radius:5px;font-size:22px;font-weight:600;color:#f8fafc"><span style="width:10px;height:10px;border-radius:9px;background:#fbbf24"></span>Working prototype on synthetic data</div>' +
        '</div></div>'
      ).style.opacity = String(o);
    },
    view(z, tx, ty) {
      const b = document.body;
      b.style.transformOrigin = "0 0";
      b.style.transform = z === 1 && tx === 0 && ty === 0 ? "" : "translate(" + tx + "px," + ty + "px) scale(" + z + ")";
    },
  };
  const vt = new WeakMap();
  window.__stepAnimations = (ms) => {
    for (const a of document.getAnimations()) {
      const t = (vt.get(a) ?? 0) + ms;
      vt.set(a, t);
      a.pause();
      a.currentTime = t;
    }
  };
})();
`;

type Rect = { x: number; y: number; w: number; h: number };
type Cam = { z: number; tx: number; ty: number };
type FilmApi = {
  __film: Record<string, (...a: number[]) => void>;
  __stepAnimations: (ms: number) => void;
  __arrival?: { at: (t: number) => void; steady: () => boolean; ready: () => boolean };
};

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

class Film {
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
      ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-vf", scale, "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-tune", "stillimage", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-r", String(FPS), "-movflags", "+faststart", file],
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

async function images(page: Page) {
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), undefined, { timeout: 15000 });
}

/** Stops the take if a number the voiceover speaks is not on screen. */
async function expectText(page: Page, selector: string, ...texts: string[]) {
  const got = ((await page.locator(selector).first().textContent()) ?? "").replace(/\s+/g, " ").trim();
  for (const text of texts) if (!got.includes(text)) throw new Error(`expected "${text}" in ${selector}, saw "${got.slice(0, 200)}"`);
}

async function main() {
  await fetch(`${API}/review/reset`, { method: "POST" });
  // WebGL through SwiftShader, so the 3D map renders the same in any headless run.
  // A kept profile, so map tiles stay in the browser's own cache from one take to the next.
  const context = await chromium.launchPersistentContext(join(HERE, ".cache", "chromium"), {
    viewport: VIEW,
    deviceScaleFactor: 1920 / VIEW.width,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  await context.addInitScript(OVERLAYS);
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  // The clock is installed now and runs in real time until the arrival ends.
  await page.clock.install({ time: new Date("2026-09-24T03:10:10+05:30") });
  await page.goto(`${BASE_URL}/?film=1`);
  await page.waitForSelector("[data-open-well]");
  await page.evaluate(() => document.fonts.ready);
  if (STILLS) mkdirSync(join(OUT, "stills"), { recursive: true });

  const file = join(OUT, FROM === 0 && TO === DURATION ? "demo.mp4" : `slice-${FROM}-${TO}.mp4`);
  const f = new Film(page, file);
  f.live = true;
  const at = (id: string) => SCENES.find((s) => s.id === id)!.start;
  const started = Date.now();
  const log = (msg: string) => console.log(`${f.t.toFixed(2).padStart(6)}s  ${msg}  (${((Date.now() - started) / 1000).toFixed(0)}s real)`);
  const arrival = () => page.evaluate(() => (window as unknown as FilmApi).__arrival ?? null);
  const nav = async (name: string, ready: string) => {
    await f.moveTo(`[data-nav='${name}']`, 0.7);
    await f.click(async () => {
      await page.waitForSelector(ready);
      await images(page);
    });
  };

  // 0:00 Home. The engineer types the well and opens it.
  log("home");
  await f.showCursor(1150, 640);
  await f.until(0.8);
  await f.moveTo("#well", 0.8, -120, 0);
  await f.click();
  for (const ch of "KN-125") {
    await page.keyboard.type(ch);
    await f.frames(5);
  }
  await f.frames(6);
  await f.moveTo("[data-open-button]", 0.6);
  await f.until(ARRIVAL_AT - 0.35);
  await f.click(async () => {
    await page.waitForFunction(() => (window as unknown as FilmApi).__arrival?.ready(), undefined, { timeout: 60_000 });
  });

  // 0:05 The arrival: every frame at its own arrival time, once the map has its tiles. High over
  // India the map keeps refining and may never report steady; by 6 s every tile it shows is loaded.
  await f.hideCursor();
  let unsteady = 0;
  f.hook = async (record) => {
    const t = Math.max(0, f.t - ARRIVAL_AT);
    await page.evaluate((v) => (window as unknown as FilmApi).__arrival?.at(v), t);
    if (!record || !(await arrival())) return;
    await page.waitForTimeout(40);
    await page
      .waitForFunction(() => (window as unknown as FilmApi).__arrival?.steady() ?? true, undefined, { timeout: 6_000, polling: 40 })
      .catch(() => unsteady++);
  };
  await f.until(at("fly") + 5);
  await expectText(page, "[data-fly-1867]", "1867");
  log("fly");
  await f.until(at("field") + 5);
  await expectText(page, "[data-arrival-title]", `${SPOKEN.inside} offset wells within 5 km`);
  log("field");
  await f.until(at("slice") - 1.5);
  await expectText(page, "[data-arrival-counter]", SPOKEN.reports, String(SPOKEN.found), "24");
  await f.until(ARRIVAL_AT + ARRIVAL.end);
  log(`slice done; ${unsteady} arrival frames shot at the 6 s cap`);

  // 0:57 The console. The arrival ends itself at its last time; from here the clock is stepped frame by frame.
  f.hook = null;
  await page.evaluate((v) => (window as unknown as FilmApi).__arrival?.at(v), ARRIVAL.end);
  await page.waitForSelector("[data-arrival]", { state: "detached" });
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 50));
  f.live = false;
  await f.frames(2);

  // 0:57 Alert 1, before the call.
  log("alert");
  await f.showCursor(1060, 520);
  await f.until(at("alert") + 3);
  await f.zoomOn("[data-alert='1']", 1.9, 0.9);
  await expectText(page, "[data-alert='1']", "13 h 30 m", "Watch");
  f.ringOn("[data-alert='1']");
  await f.pointAt("[data-alert='1']", 0.8);
  // The call lands 15 ticks after play, at 1:22, inside the "call" scene.
  await f.until(at("call") - 6);
  await page.keyboard.press("Space");
  await f.until(at("call") - 2.5);
  await expectText(page, "[data-alert='1']", "13 h 30 m");
  f.ringOff();
  await f.camera(null, 0.8);

  // 1:13 Onto KN-125: the prognosed top, the bit, and the lane where the call will land.
  await f.until(at("call"));
  log("call");
  const pin = await f.layoutRect("[data-pin='active-1']");
  await f.camera({ cx: pin.x - 10, cy: pin.y - 70, z: 1.55 }, 1.1);
  await expectText(page, "svg[aria-label='Correlation section']", "2,910 m");
  await f.until(at("call") + 6);
  await f.move(1240, 640, 0.7);
  await f.until(at("retie") - 0.5);
  await expectText(page, "svg[aria-label='Correlation section']", "2,872 m", "−38 m");
  await expectText(page, "[data-feed='mud-logger']", "03:12");

  // 1:26 The whole section, re-tied: all three alerts moved.
  await f.until(at("retie"));
  log("retie");
  await f.camera(null, 0.9);
  await f.until(at("retie") + 2.5);
  await f.moveTo("[data-pin='active-3']", 1.6, 70, -6);
  await f.until(at("retie") + 6);
  await f.moveTo("[data-pin='active-1']", 1.2, 70, -6);
  await f.until(at("retie") + 10);
  await f.zoomOn("[data-alert='1']", 1.9, 0.9);
  await expectText(page, "[data-alert='1']", "10 h 20 m", "Prepare", "13 h 30 m");
  f.ringOn("[data-alert='1']");
  await f.pointAt("[data-alert='1']", 0.7);
  await f.until(at("change") - 1.2);
  f.ringOff();
  await f.camera(null, 0.8);

  // 1:46 What changes: the section re-ties the moment the call comes in.
  await f.until(at("change"));
  log("change");
  await expectText(page, "[data-feed='system']", "Alert 1 is now PREPARE, 10 h 20 m.");
  f.ringOn("[data-feed='system']", 5);
  await f.camera({ cx: 700, cy: 450, z: 1.06 }, 9.2, (k) => k);
  f.ringOff();
  await f.camera(null, 0.6);

  // 1:57 Open it: the KN-117 report behind the alert, read by OCR on screen.
  await f.until(at("source"));
  log("source");
  await f.moveTo("[data-pin='active-1']", 0.6, 0, 0);
  await f.click(async () => {
    await page.waitForSelector("[data-drawer='open']");
    await page.waitForSelector("[data-ocr-layer]");
    await images(page);
  });
  await expectText(page, "[role='dialog']", "KN-117-2018-02-03", "page 1", "3 Feb 2018", "scanned page");
  // Park the pointer in the drawer's empty left column, off the report page OCR is reading.
  const lessons = await f.box("[role='dialog'] [data-lessons]");
  await f.move(lessons.x + 40, lessons.y + lessons.height + 70, 0.8);
  await f.until(at("source") + 4.5);
  await f.zoomOn("[data-page-viewer]", 1.3, 1.0, 0, -120);

  // 2:12 The sentence that backs the recommendation, and how sure the parser was.
  await f.until(at("sentence"));
  log("sentence");
  await f.zoomOn("[data-sentence='0']", 2.1, 1.0, 120, -20);
  await expectText(page, "[role='dialog']", "Caved at 9.8 ppg, hole stable at 10.4 ppg.");
  const s = await f.box("[data-sentence='0']");
  await f.move(s.x - 16, s.y + s.height + 14, 0.9);
  await f.until(at("sentence") + 7);
  await f.zoomOn("[data-confidence]", 2.0, 1.0, -160, 10);
  await expectText(page, "[data-confidence]", SPOKEN.confidence);
  await f.until(at("ingest") - 0.8);
  await f.camera(null, 0.5);
  await page.keyboard.press("Escape");
  await f.frames(2);

  // 2:27 The parser's record over all the reports.
  await f.until(at("ingest"));
  log("ingest");
  await nav("ingest", "[data-accuracy]");
  await expectText(page, "[data-pipeline]", SPOKEN.reports, String(SPOKEN.waiting));
  await expectText(page, "[data-accuracy]", `${SPOKEN.found} of ${SPOKEN.planted}`);
  await f.until(at("ingest") + 4);
  await f.zoomOn("[data-accuracy]", 1.6, 1.0);
  f.ringOn("[data-accuracy]", 4);
  await f.until(at("ingest") + 10.5);
  f.ringOff();
  await f.camera(null, 0.7);

  // 2:42 Real reports: Equinor's Volve field.
  await f.until(at("volve"));
  log("volve");
  await f.scrollTo("[data-ingestion-scroll]", "[data-volve]", 1.2, 16);
  await expectText(page, "[data-volve]", SPOKEN.volveReports, SPOKEN.volveHazards, `${SPOKEN.volveRight}`);
  await f.zoomOn("[data-volve]", 1.55, 1.0);
  await f.until(at("volve") + 9);
  f.ringOn("[data-volve-check]", 4);
  await f.until(at("action") - 1.2);
  f.ringOff();
  await f.camera(null, 0.7);

  // 2:59 Back to the well: what to do about it.
  await f.until(at("action"));
  log("action");
  await nav("section", "svg[aria-label='Correlation section']");
  await expectText(page, "[data-rec-line='0']", "Raise mud weight 9.8 → 10.4 ppg before 3,007 m");
  await expectText(page, "[data-rec-line='1']", "3,007 m");
  await f.zoomOn("[data-recommendation]", 1.8, 1.0);
  f.ringOn("[data-rec-line='0']", 5);
  await f.pointAt("[data-rec-line='0']", 0.8);
  await f.until(at("action") + 8);
  f.ringOff();
  await f.frames(6);
  f.ringOn("[data-rec-line='1']", 5);
  await f.pointAt("[data-rec-line='1']", 0.6);
  await f.until(at("more") - 1);
  f.ringOff();
  await f.camera(null, 0.8);

  // 3:14 The rest of the product, briefly.
  await f.until(at("more"));
  log("more");
  await nav("search", "[data-try]");
  await f.moveTo("[data-try='losses in Tipam within 5 km since 2015']", 0.6);
  await f.click(async () => {
    await page.waitForSelector("[data-count]");
  });
  await f.until(at("more") + 4.5);
  await nav("compare", "svg");
  await f.until(at("more") + 8.8);
  await nav("briefing", "[data-briefing], h1");
  await f.until(at("research") - 0.2);

  // 3:27 How we built it.
  await f.until(at("research"));
  log("research");
  await nav("research", "[data-research]");
  // The pointer leaves the frame; the rings follow the voiceover through the dossier.
  await f.hideCursor();
  await f.until(at("research") + 2);
  await expectText(page, "[data-stats]", "7", "of", "1,759", SPOKEN.reports, String(SPOKEN.repos));
  f.ringOn("[data-asks]", 6);
  await f.until(at("research") + 6.8);
  f.ringOff();
  await f.frames(8);
  f.ringOn("[data-sources]", 6);
  await f.until(at("research") + 13.2);
  f.ringOff();
  await f.frames(8);
  await expectText(page, "[data-prior]", String(SPOKEN.repos));
  f.ringOn("[data-prior]", 5);
  await f.until(at("card") - 1);
  f.ringOff();

  // 3:47 End card.
  await f.until(at("card"));
  log("card");
  f.lowerThird = false;
  for (let i = 1; i <= 18; i++) {
    f.card = i / 18;
    await f.shot();
  }
  await f.until(DURATION);

  await f.close();
  await context.close();
  log(`wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
