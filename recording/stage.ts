import type { Page } from "playwright";

export const BASE_URL = process.env.WELLS_URL ?? "http://localhost:3000";

/** Timeline constants mirrored from apps/web/src/lib/scene.ts, checked against the page at run time. */
export const RETIE_DELAY_MS = 700;
export const RETIE_MS = 1500;
export const TIMELINE_MS = RETIE_DELAY_MS + RETIE_MS + 900;
export const MS_PER_TICK = 1000;
/** The take opens this many ticks before the Barail call; see REPLAY.openTicksBeforeCall. */
export const TICKS_TO_CALL = 15;

/** Opens the hero paused on the take's first frame and waits for fonts and the drawn section. */
export async function openHero(page: Page) {
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector('svg[aria-label="Correlation section"]');
  await page.evaluate(() => document.fonts.ready);
  const tick = Number(await page.getAttribute("[data-tick]", "data-tick"));
  return tick;
}

export async function currentTick(page: Page) {
  return Number(await page.getAttribute("[data-tick]", "data-tick"));
}

export async function retieState(page: Page) {
  return page.getAttribute("[data-retie]", "data-retie");
}
