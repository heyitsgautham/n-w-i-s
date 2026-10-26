// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { displayAtMd, formatHours, type OffsetEvent } from "@wells/correlate";
import { buildDemoPack } from "@wells/synth";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHeroModel } from "@/lib/hero-model";
import { buildScene } from "@/lib/scene";
import { ActivePins, OffsetPins, ProjectionLines } from "./annotations";
import { displayIntervals, layoutSection, type DisplayInterval } from "./layout";

// The demo pack's section at the Barail call, laid out at 1440 by 820 the way CorrelationPanel does it.
const pack = buildDemoPack();
const parsed: OffsetEvent[] = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../../../data/demo/extracted/events.json"), "utf8"));
const model = buildHeroModel(pack, parsed);
const call = pack.replay.messages.find((m) => m.topCall)!;
const scene = buildScene(model, call.tick, null);
const L = layoutSection(1440, 820, model.wells, model.activeWellId, model.window);
const active = L.wells.find((w) => w.active)!;
const beyond = model.window.bottom + 400;
const intervals = new Map<string, DisplayInterval[]>();
for (const w of model.wells) intervals.set(w.id, displayIntervals(w, w.id === active.well.id ? scene.tops : w.tops, model.datumRt, beyond));
const byId = new Map(model.wells.map((w) => [w.id, w]));
const display = (wellId: string, md: number) => displayAtMd(byId.get(wellId)!, md, model.datumRt);
const ctx = { L, wells: L.wells, active, intervals, display };
const ai = L.wells.indexOf(active);

const svg = (node: React.ReactNode) => render(<svg>{node}</svg>).container;

describe("section annotations", () => {
  afterEach(cleanup);

  it("has alerts from offsets on both sides of the active well", () => {
    const sides = new Set(scene.alerts.map((a) => Math.sign(L.wells.findIndex((w) => w.well.id === a.event.wellId) - ai)));
    expect(scene.alerts.length).toBeGreaterThan(2);
    expect(sides).toEqual(new Set([-1, 1]));
  });

  it("pins each alert at its event's depth on the offset's edge facing the active well", () => {
    const root = svg(<OffsetPins ctx={ctx} alerts={scene.alerts} passed={[]} onOpen={() => undefined} />);
    for (const a of scene.alerts) {
      const w = L.wells.find((x) => x.well.id === a.event.wellId)!;
      const dir = L.wells.indexOf(w) < ai ? 1 : -1;
      const badge = root.querySelector(`[data-pin="offset-${a.n}"] circle`)!;
      expect(Number(badge.getAttribute("cx"))).toBeCloseTo((dir > 0 ? w.lith.x1 : w.lith.x0) + dir * 14, 6);
      expect(Number(badge.getAttribute("cy"))).toBeCloseTo(L.y(display(w.well.id, a.event.md)), 6);
      expect(root.querySelector(`[data-pin="offset-${a.n}"] text`)?.textContent).toBe(String(a.n));
    }
  });

  it("opens the event when its pin is clicked", () => {
    const onOpen = vi.fn();
    const root = svg(<OffsetPins ctx={ctx} alerts={scene.alerts} passed={[]} onOpen={onOpen} />);
    const first = scene.alerts[0]!;
    fireEvent.click(root.querySelector(`[data-pin="offset-${first.n}"]`)!);
    expect(onOpen).toHaveBeenCalledWith(first.event);
  });

  it("runs each projection line from the offset pin to the projected depth on the active well", () => {
    const root = svg(<ProjectionLines ctx={ctx} alerts={scene.alerts} />);
    const groups = root.querySelectorAll("g[opacity]");
    expect(groups).toHaveLength(scene.alerts.length);
    scene.alerts.forEach((a, i) => {
      const lines = groups[i]!.querySelectorAll("line");
      expect(lines.length).toBeGreaterThan(0);
      const first = lines[0]!;
      const last = lines[lines.length - 1]!;
      expect(Number(first.getAttribute("y1"))).toBeCloseTo(L.y(display(a.event.wellId, a.event.md)), 6);
      expect(Number(last.getAttribute("y2"))).toBeCloseTo(L.y(display(active.well.id, a.projection.md)), 6);
      const dir = L.wells.findIndex((w) => w.well.id === a.event.wellId) < ai ? 1 : -1;
      expect(Number(last.getAttribute("x2"))).toBe(dir > 0 ? active.left : active.right);
    });
  });

  it("labels each projected hazard on the active well with its time to hazard", () => {
    const root = svg(<ActivePins ctx={ctx} alerts={scene.alerts} onOpen={() => undefined} />);
    for (const a of scene.alerts) {
      const texts = [...root.querySelectorAll(`[data-pin="active-${a.n}"] text`)].map((t) => t.textContent);
      expect(texts).toContain(a.hours === null ? "passed" : formatHours(a.hours));
      expect(texts.at(-1)).toContain(a.event.wellId);
    }
  });
});
