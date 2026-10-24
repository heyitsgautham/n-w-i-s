import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OffsetEvent } from "@wells/correlate";
import { buildDemoPack } from "@wells/synth";
import { describe, expect, it } from "vitest";
import { bearingOf, buildHeroModel } from "./hero-model";
import { buildScene, RETIE_DELAY_MS, RETIE_MS, retieProgress } from "./scene";

const pack = buildDemoPack();
const extracted = join(dirname(fileURLToPath(import.meta.url)), "../../../../data/demo/extracted/events.json");
const parsed: OffsetEvent[] = JSON.parse(readFileSync(extracted, "utf8"));
const model = buildHeroModel(pack, parsed);
const call = pack.replay.messages.find((m) => m.topCall)!;

describe("bearingOf", () => {
  it("names the eight compass points from field offsets", () => {
    expect([bearingOf(0, 1), bearingOf(1, 1), bearingOf(1, 0), bearingOf(0, -1), bearingOf(-1, 0), bearingOf(-1, 1)]).toEqual([
      "N",
      "NE",
      "E",
      "S",
      "W",
      "NW",
    ]);
  });
});

describe("buildHeroModel", () => {
  it("keeps only parsed events from section wells that may raise an alert", () => {
    expect(model.events.length).toBeGreaterThan(0);
    for (const e of model.events) {
      expect(pack.sectionOrder).toContain(e.wellId);
      expect(e.needsReview).toBeFalsy();
    }
  });

  it("frames the window from above the bit at open to below the furthest near alert", () => {
    const open = pack.replay.ticks[pack.replay.openTick]!;
    expect(model.window.top).toBeLessThan(open.bitMd);
    expect(model.window.bottom).toBeGreaterThan(model.window.top);
    expect(model.window.top % 10).toBe(0);
    expect(model.window.bottom % 10).toBe(0);
  });

  it("gives the active well no distance or bearing and every offset both", () => {
    for (const w of model.wells) {
      if (w.id === model.activeWellId) expect([w.distanceKm, w.bearing]).toEqual([null, null]);
      else expect(w.distanceKm).toBeGreaterThan(0);
    }
  });
});

describe("retieProgress", () => {
  it("holds at 0 through the delay, eases through the middle and lands on 1", () => {
    expect(retieProgress(null)).toBe(1);
    expect(retieProgress(0)).toBe(0);
    expect(retieProgress(RETIE_DELAY_MS)).toBe(0);
    expect(retieProgress(RETIE_DELAY_MS + RETIE_MS / 2)).toBeCloseTo(0.5, 9);
    expect(retieProgress(RETIE_DELAY_MS + RETIE_MS / 4)).toBeLessThan(0.25);
    expect(retieProgress(RETIE_DELAY_MS + RETIE_MS * 2)).toBe(1);
  });
});

describe("buildScene", () => {
  it("shows the prognosis untouched before the mud logger's call", () => {
    const scene = buildScene(model, call.tick - 1, null);
    expect(scene.call).toBeNull();
    expect(scene.tops).toBe(scene.prognosis);
    expect(scene.messages.every((m) => m.tick < call.tick)).toBe(true);
  });

  it("re-ties the section 38 m up once the call has played out", () => {
    const scene = buildScene(model, call.tick, null);
    expect(scene.call!.shiftM).toBe(-38);
    expect(scene.call!.progress).toBe(1);
    expect(scene.tops.find((t) => t.formationId === "BCS")!.md).toBe(2872);
  });

  it("starts the slide from the old tops when the call has just arrived", () => {
    const scene = buildScene(model, call.tick, 0);
    expect(scene.tops.map((t) => t.md)).toEqual(scene.call!.before.map((t) => t.md));
  });

  it("numbers alerts in the window from 1 and keeps passed ones apart", () => {
    const scene = buildScene(model, call.tick, null);
    expect(scene.alerts.map((a) => a.n)).toEqual(scene.alerts.map((_, i) => i + 1));
    for (const a of scene.alerts) expect(a.band).not.toBe("passed");
    for (const a of scene.passed) expect(a.band).toBe("passed");
  });

  it("puts the bit in a formation with the next top below it", () => {
    const { formationAtBit, telemetry } = buildScene(model, call.tick, null);
    expect(formationAtBit!.top.md).toBeLessThanOrEqual(telemetry.bitMd);
    if (formationAtBit!.next) expect(formationAtBit!.next.md).toBeGreaterThan(telemetry.bitMd);
  });

  it("refuses a tick the replay does not have", () => {
    expect(() => buildScene(model, pack.replay.ticks.length, null)).toThrow(/no telemetry/);
  });
});
