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

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { T as ARRIVAL } from "../apps/web/src/lib/arrival";
import { OVERLAYS, type FilmApi } from "./overlays";
import { Film, FROM, OUT, STILLS, TO, VIEW } from "./recorder";
import { BASE_URL } from "./stage";
import { ARRIVAL_AT, DURATION, SCENES, SPOKEN, voiceoverMarkdown } from "./storyboard";

const HERE = import.meta.dirname;
const API = process.env.WELLS_API_URL ?? "http://127.0.0.1:8121";

mkdirSync(OUT, { recursive: true });
writeFileSync(join(HERE, "voiceover.md"), voiceoverMarkdown());

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
