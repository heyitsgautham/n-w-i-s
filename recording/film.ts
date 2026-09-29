/**
 * Records the demo video from recording/storyboard.ts: one example, alert 1 on KN-125, from the
 * mud-logger call to the KN-117 report page and back to the recommendation.
 *
 * The page runs on Playwright's fake clock and every frame is stepped by hand: the replay ticks,
 * the re-tie animation and every CSS transition advance exactly 1/30 s per frame, however long a
 * screenshot takes. The same script produces the same video on any machine.
 *
 * It records a 1600x900 viewport at 2x and exports 1920x1080, so rail text survives compression.
 * Edit zooms are CSS transforms on the page, so zoomed text is re-rendered sharp, not upscaled.
 * The cursor, the ring, the lower third and the end card are drawn by this script, outside the app.
 *
 *   pnpm dev            # API on 8121, web on WEB_PORT or 3000
 *   pnpm film           # writes recording/out/demo.mp4 and recording/voiceover.md
 *
 * Options: WELLS_URL (web), WELLS_API_URL (API), FILM_FROM / FILM_TO in seconds to render a slice,
 * FILM_STILLS=1 to also save one still per second.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { BASE_URL } from "./stage";
import { DURATION, FPS, SCENES, voiceoverMarkdown } from "./storyboard";
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
        '<div style="display:flex;align-items:baseline;gap:12px"><span style="font-weight:700;font-size:30px;letter-spacing:.14em;color:#f8fafc">N-W-I-S</span><span style="font-size:18px;color:#cbd5e1">Offset-well memory</span></div>' +
        '<div style="margin-top:7px;font-size:13.5px;font-weight:600;letter-spacing:.12em;color:#94a3b8">OIL INDIA LIMITED · TEAM 1, SAVEETHA ENGINEERING COLLEGE</div>'
      ).style.opacity = String(o);
    },
    card(o) {
      el("film-card", "inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;" + font,
        '<div style="display:flex;align-items:center;gap:46px">' + mark +
        '<div><div style="font-size:20px;font-weight:600;letter-spacing:.16em;color:#94a3b8">OIL INDIA LIMITED</div>' +
        '<div style="margin-top:12px;font-size:128px;line-height:.9;font-weight:700;letter-spacing:.05em;color:#f8fafc">N-W-I-S</div>' +
        '<div style="margin-top:12px;font-size:40px;color:#e2e8f0">Offset-well memory</div>' +
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
type FilmApi = { __film: Record<string, (...a: number[]) => void>; __stepAnimations: (ms: number) => void };

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

class Film {
  frame = 0;
  private ffmpeg;
  private cursor = { x: 1060, y: 520 };
  private cam: Cam = { z: 1, tx: 0, ty: 0 };
  private ring: { selector: string | null; opacity: number; target: number; pad: number } = { selector: null, opacity: 0, target: 0, pad: 6 };
  lowerThird = true;
  card = 0;

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

  async shot() {
    await this.page.clock.runFor(FRAME_MS);
    await this.page.evaluate((ms) => (window as unknown as FilmApi).__stepAnimations(ms), FRAME_MS);
    await this.settle();
    await this.overlays();
    if (this.t >= FROM && this.t < TO) {
      const buf = await this.page.screenshot({ type: "jpeg", quality: 92 });
      if (!this.ffmpeg.stdin.write(buf)) await new Promise((r) => this.ffmpeg.stdin.once("drain", r));
      if (STILLS && this.frame % FPS === 0) writeFileSync(join(OUT, "stills", `${String(Math.round(this.t)).padStart(3, "0")}.jpg`), buf);
    }
    this.frame++;
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
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  await context.addInitScript(OVERLAYS);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.clock.install({ time: new Date("2026-09-24T03:10:10+05:30") });
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector('svg[aria-label="Correlation section"]');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 50));
  if (STILLS) mkdirSync(join(OUT, "stills"), { recursive: true });

  const file = join(OUT, FROM === 0 && TO === DURATION ? "demo.mp4" : `slice-${FROM}-${TO}.mp4`);
  const f = new Film(page, file);
  const at = (id: string) => SCENES.find((s) => s.id === id)!.start;
  const started = Date.now();
  const log = (msg: string) => console.log(`${f.t.toFixed(2).padStart(6)}s  ${msg}  (${((Date.now() - started) / 1000).toFixed(0)}s real)`);

  // 0:00 The product, KN-125 loaded and drilling, with the lower third. The call lands 15 ticks in.
  await page.keyboard.press("Space");
  await f.move(1060, 520, 0.05);
  log("open");
  await expectText(page, "[data-alert='1']", "13 h 30 m", "Watch");
  await f.until(2.5);
  await f.move(700, 440, 2.6);

  // 0:07 Alert 1 before the call.
  await f.until(at("alert"));
  log("alert");
  await f.zoomOn("[data-alert='1']", 1.9, 0.9);
  f.ringOn("[data-alert='1']");
  await f.pointAt("[data-alert='1']", 0.8);
  await f.until(11.6);
  f.ringOff();

  // 0:12 Onto KN-125: the prognosed top, the bit, and the lane where the call will land.
  await f.until(at("call"));
  log("call");
  const pin = await f.layoutRect("[data-pin='active-1']");
  await f.camera({ cx: pin.x - 10, cy: pin.y - 70, z: 1.55 }, 1.1);
  await expectText(page, "svg[aria-label='Correlation section']", "2,910 m");
  await f.until(14.2);
  await f.move(1240, 640, 0.7);
  await f.until(17.6);
  await expectText(page, "svg[aria-label='Correlation section']", "2,872 m", "−38 m");

  // 0:19 The whole section, re-tied: all three alerts moved.
  await f.until(at("retie"));
  log("retie");
  await f.camera(null, 0.9);
  await f.until(21);
  await f.moveTo("[data-pin='active-3']", 1.6, 70, -6);
  await f.until(24.2);
  await f.moveTo("[data-pin='active-1']", 1.2, 70, -6);

  // 0:26 Alert 1 after the call.
  await f.until(at("flip"));
  log("flip");
  await f.zoomOn("[data-alert='1']", 1.9, 0.9);
  await expectText(page, "[data-alert='1']", "10 h 20 m", "Prepare", "13 h 30 m");
  f.ringOn("[data-alert='1']");
  await f.pointAt("[data-alert='1']", 0.7);
  await f.until(30.9);
  f.ringOff();
  await f.camera(null, 0.8);

  // 0:32 Open it: the KN-117 report behind the alert.
  await f.until(at("source"));
  log("source");
  await f.moveTo("[data-pin='active-1']", 0.6, 0, 0);
  await f.click(async () => {
    await page.waitForSelector("[data-drawer='open']");
    await images(page);
  });
  await f.frames(6);
  await expectText(page, "[role='dialog']", "KN-117-2018-02-03", "page 1", "3 Feb 2018");
  await f.zoomOn("[data-page-viewer]", 1.3, 1.0, 0, -120);
  await f.move(1180, 250, 0.8);

  // 0:38 The sentence that backs the recommendation.
  await f.until(at("sentence"));
  log("sentence");
  await f.zoomOn("[data-sentence='0']", 2.1, 1.0, 120, -20);
  await expectText(page, "[role='dialog']", "Caved at 9.8 ppg, hole stable at 10.4 ppg.");
  const s = await f.box("[data-sentence='0']");
  await f.move(s.x - 16, s.y + s.height + 14, 0.9);

  // 0:45 How sure the parser was.
  await f.until(at("confidence"));
  log("confidence");
  await f.zoomOn("[data-confidence]", 2.0, 1.0, -160, 10);
  await expectText(page, "[data-confidence]", "0.99");
  await f.until(50.2);
  await f.camera(null, 0.5);
  await page.keyboard.press("Escape");
  await f.frames(2);

  // 0:51 What to do about it.
  await f.until(at("action"));
  log("action");
  await expectText(page, "[data-rec-line='0']", "Raise mud weight 9.8 → 10.4 ppg before 3,007 m");
  await expectText(page, "[data-rec-line='1']", "3,007 m");
  await f.zoomOn("[data-recommendation]", 1.8, 1.0);
  f.ringOn("[data-rec-line='0']", 5);
  await f.pointAt("[data-rec-line='0']", 0.8);
  await f.until(57.5);
  f.ringOff();
  await f.frames(6);
  f.ringOn("[data-rec-line='1']", 5);
  await f.pointAt("[data-rec-line='1']", 0.6);
  await f.until(62);
  f.ringOff();
  await f.camera(null, 0.9);

  // 1:03 What changes: the section re-ties the moment the call comes in.
  await f.until(at("change"));
  log("change");
  await expectText(page, "[data-feed='system']", "Alert 1 is now PREPARE, 10 h 20 m.");
  f.ringOn("[data-feed='system']", 5);
  await f.camera({ cx: 700, cy: 450, z: 1.06 }, 9.2, (k) => k);
  f.ringOff();

  // 1:13 End card.
  await f.until(at("card"));
  log("card");
  f.lowerThird = false;
  for (let i = 1; i <= 18; i++) {
    f.card = i / 18;
    await f.shot();
  }
  await f.until(DURATION);

  await f.close();
  await browser.close();
  log(`wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
