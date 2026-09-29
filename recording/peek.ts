/**
 * Quick stills of any route for checking the UI by eye: `tsx recording/peek.ts /map /search?q=...`.
 * Each argument is a path; add `#click=<selector>` to click before the shot. Writes to recording/frames/peek/.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { BASE_URL } from "./stage";

const out = join(import.meta.dirname, "frames", "peek");
mkdirSync(out, { recursive: true });
const width = Number(process.env.W ?? 1920);
const height = Number(process.env.H ?? 1080);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text().slice(0, 300)));
for (const [i, arg] of process.argv.slice(2).entries()) {
  const [path, ...actions] = arg.split("#");
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  for (const a of actions) {
    const at = a.indexOf("=");
    const [kind, sel] = [a.slice(0, at), a.slice(at + 1)];
    if (kind === "click") await page.click(sel!);
    if (kind === "wait") await page.waitForTimeout(Number(sel));
  }
  await page.waitForTimeout(700);
  const file = join(out, `${String(i).padStart(2, "0")}-${width}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
