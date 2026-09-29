/**
 * Stills of the hero before, during and after the re-tie, on a fake clock so every run lands on
 * the same animation frame. Run with the dev server up: `pnpm dev`, then `pnpm shots`.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { currentTick, MS_PER_TICK, openHero, RETIE_DELAY_MS, RETIE_MS, retieState, TICKS_TO_CALL, TIMELINE_MS } from "./stage";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "shots");

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
];

async function settle(page: Page) {
  // Let React commit whatever the fake clock just released, in real time.
  await page.waitForTimeout(250);
}

async function run(viewport: (typeof VIEWPORTS)[number]) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.clock.install({ time: new Date("2026-09-24T03:10:10+05:30") });
  const openTick = await openHero(page);
  // From here time only moves when the script says so.
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 100));
  const dir = join(OUT, viewport.name);
  mkdirSync(dir, { recursive: true });
  const shot = async (name: string) => {
    await settle(page);
    await page.screenshot({ path: join(dir, `${name}.png`) });
    console.log(`${viewport.name} ${name}: tick ${await currentTick(page)}, re-tie ${await retieState(page)}`);
  };

  await shot("01-before");

  await page.click('[data-control="play"]');
  await page.waitForSelector('[data-control="play"]:has-text("Pause")');
  await settle(page);
  await page.clock.runFor(TICKS_TO_CALL * MS_PER_TICK);
  await page.waitForSelector(`[data-tick="${openTick + TICKS_TO_CALL}"]`);
  await settle(page);
  await page.clock.runFor(350);
  await shot("02-call-arrives");

  // 55% through the slide: past the WATCH to PREPARE flip, clear of the 12 h boundary.
  const during = RETIE_DELAY_MS + RETIE_MS * 0.55;
  await page.clock.runFor(during - 350);
  await shot("03-during-retie");

  await page.clock.runFor(TIMELINE_MS - during + 100);
  await page.waitForSelector('[data-retie="settled"]');
  // The band-flip flash is a CSS animation on real time; let it finish.
  await page.waitForTimeout(1500);
  await shot("04-after");

  await browser.close();
}

for (const v of VIEWPORTS) await run(v);
