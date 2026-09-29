"use client";

import { displayAtMd, type OffsetEvent } from "@wells/correlate";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { HeroModel } from "@/lib/hero-model";
import { RETIE_DELAY_MS, RETIE_MS, TIMELINE_MS, type Scene } from "@/lib/scene";
import { ActivePins, ActiveTops, CallCallout, OffsetPins, ProjectionLines } from "./annotations";
import { DepthGrid, SectionHeaders } from "./frame";
import { FaultTrace, FormationNames, GapFills, TieLines } from "./geology";
import { displayIntervals, layoutSection, type DisplayInterval } from "./layout";
import { LithologyPatterns } from "./patterns";
import { ActiveTracks, BitMarker, OffsetTracks } from "./well-tracks";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: Math.floor(el.clientWidth), height: Math.floor(el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function CorrelationPanel({ model, scene, onOpen }: { model: HeroModel; scene: Scene; onOpen: (e: OffsetEvent) => void }) {
  const [ref, size] = useSize<HTMLDivElement>();
  return (
    <div ref={ref} className="relative min-h-0 flex-1">
      {size && size.width > 0 && <Section model={model} scene={scene} width={size.width} height={size.height} onOpen={onOpen} />}
    </div>
  );
}

function Section({
  model,
  scene,
  width,
  height,
  onOpen,
}: {
  model: HeroModel;
  scene: Scene;
  width: number;
  height: number;
  onOpen: (e: OffsetEvent) => void;
}) {
  const L = useMemo(
    () => layoutSection(width, height, model.wells, model.activeWellId, model.window),
    [width, height, model],
  );
  const lithOf = useMemo(() => {
    const map = new Map(model.formations.map((f) => [f.id, f.lithology]));
    return (id: string) => map.get(id) ?? "shale";
  }, [model.formations]);
  const beyond = model.window.bottom + 400;

  // Offsets never move; only the active well's tops change with a call.
  const offsetIntervals = useMemo(() => {
    const m = new Map<string, DisplayInterval[]>();
    for (const w of model.wells) if (w.role === "offset") m.set(w.id, displayIntervals(w, w.tops, model.datumRt, beyond));
    return m;
  }, [model, beyond]);

  const active = L.wells.find((w) => w.active)!;
  const activeIntervals = displayIntervals(active.well, scene.tops, model.datumRt, beyond);
  const intervals = new Map(offsetIntervals);
  intervals.set(active.well.id, activeIntervals);

  const byId = new Map(model.wells.map((w) => [w.id, w]));
  const display = (wellId: string, md: number) => displayAtMd(byId.get(wellId)!, md, model.datumRt);
  const ctx = { L, wells: L.wells, active, intervals, display };

  const t = scene.telemetry;
  const d = (md: number) => display(active.well.id, md);
  const ticksSoFar = model.replay.ticks.filter((x) => x.tick <= t.tick);
  const rop = [
    ...model.replay.ropByDepth.map((s) => ({ d: d(s.md), v: s.value })),
    ...ticksSoFar.map((x) => ({ d: d(x.bitMd), v: x.ropInstant })),
  ];
  const calledTop = scene.call?.message.topCall?.formationId;
  const highlight = scene.tops.find((x) => x.formationId === calledTop && x.status === "called")?.formationId;

  const gaps = L.wells.slice(0, -1).map((a, i) => ({ a, b: L.wells[i + 1]!, i }));
  const faultIn = (i: number) => model.faults.find((f) => f.gap === i);

  return (
    <svg width={width} height={height} className="absolute inset-0 select-none" role="img" aria-label="Correlation section">
      <LithologyPatterns />
      <defs>
        <clipPath id="draw-clip">
          <rect x={L.ruler.x1} y={L.drawTop} width={width - L.ruler.x1} height={L.drawBottom - L.drawTop} />
        </clipPath>
      </defs>
      <rect x={L.ruler.x1} y={L.drawTop} width={width - L.ruler.x1} height={L.drawBottom - L.drawTop} style={{ fill: "var(--paper)" }} />
      <DepthGrid L={L} />
      <SectionHeaders L={L} model={model} />
      <g clipPath="url(#draw-clip)">
        {gaps.map(({ a, b, i }) => (
          <GapFills key={i} L={L} a={a} b={b} ia={intervals.get(a.well.id)!} ib={intervals.get(b.well.id)!} fault={faultIn(i)} lithOf={lithOf} />
        ))}
        {gaps.map(({ a, b, i }) => {
          const f = faultIn(i);
          return f ? <FaultTrace key={i} L={L} a={a} b={b} fault={f} /> : null;
        })}
        {gaps.map(({ a, b, i }) => (
          <TieLines key={i} L={L} a={a} b={b} ia={intervals.get(a.well.id)!} ib={intervals.get(b.well.id)!} fault={faultIn(i)} highlight={highlight} />
        ))}
        {gaps[0] && (
          <FormationNames
            L={L}
            a={gaps[0].a}
            b={gaps[0].b}
            ia={intervals.get(gaps[0].a.well.id)!}
            ib={intervals.get(gaps[0].b.well.id)!}
            formations={model.formations}
          />
        )}
        <ProjectionLines ctx={ctx} alerts={scene.alerts} />
        {L.wells
          .filter((w) => !w.active)
          .map((w) => (
            <OffsetTracks key={w.well.id} L={L} w={w} intervals={intervals.get(w.well.id)!} lithOf={lithOf} />
          ))}
        <ActiveTracks
          L={L}
          w={active}
          lithOf={lithOf}
          state={{
            intervals: activeIntervals,
            bitD: d(t.bitMd),
            samplesD: d(t.samplesMd),
            gammaLimitD: d(t.bitMd - model.replay.gammaSensorOffset),
            rop,
          }}
        />
        <ActiveTops ctx={ctx} scene={scene} formations={model.formations} />
        <BitMarker L={L} w={active} bitD={d(t.bitMd)} bitMd={t.bitMd} />
        <OffsetPins ctx={ctx} alerts={scene.alerts} passed={scene.passed} onOpen={onOpen} />
        <ActivePins ctx={ctx} alerts={scene.alerts} onOpen={onOpen} />
        <CallCallout ctx={ctx} scene={scene} fadeOutAt={RETIE_DELAY_MS + RETIE_MS + 300} endAt={TIMELINE_MS} />
      </g>
    </svg>
  );
}
