"use client";

import type { Analogue, Fault, Formation, StructureGrid, WellRole } from "@wells/correlate";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { contourSegments, gridRange } from "@/lib/contours";
import { mapsKey } from "@/lib/google-maps";
import { bearingOf } from "@/lib/hero-model";
import { SatelliteMap } from "./satellite-map";

export interface MapModel {
  activeWellId: string;
  /** Where the active well sits on real imagery; the field itself is fictional. */
  anchor: { lat: number; lng: number };
  wells: { id: string; role: WellRole; x: number; y: number; spudYear: number }[];
  sectionOrder: string[];
  structure: StructureGrid;
  faults: Fault[];
  formations: Formation[];
  rankings: Record<string, Analogue[]>;
  eventCounts: Record<string, Record<string, number>>;
  defaultInterval: string;
}

const CONTOUR_STEP = 10;
const INDEX_STEP = 50;

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function StructureMap({
  model,
  radiusKm,
  inRing,
  highlight,
  best,
  onHover,
  width,
  height,
}: {
  model: MapModel;
  radiusKm: number;
  inRing: Set<string>;
  highlight: string | null;
  best: string | null;
  onHover: (id: string | null) => void;
  width: number;
  height: number;
}) {
  const g = model.structure;
  const x1 = g.x0 + g.step * (g.nx - 1);
  const y1 = g.y0 + g.step * (g.ny - 1);
  const pad = 34;
  const k = Math.min((width - pad * 2) / (x1 - g.x0), (height - pad * 2) / (y1 - g.y0));
  const ox = (width - (x1 - g.x0) * k) / 2;
  const oy = (height - (y1 - g.y0) * k) / 2;
  const X = (x: number) => ox + (x - g.x0) * k;
  const Y = (y: number) => oy + (y1 - y) * k;
  const faultXs = model.faults.map((f) => f.x);
  const [lo, hi] = useMemo(() => gridRange(g), [g]);

  const contours = useMemo(() => {
    const out: { level: number; d: string; index: boolean; label?: { x: number; y: number } }[] = [];
    for (let level = Math.ceil(lo / CONTOUR_STEP) * CONTOUR_STEP; level <= hi; level += CONTOUR_STEP) {
      const segs = contourSegments(g, level, faultXs);
      if (!segs.length) continue;
      const d = segs.map((s) => `M${s.x1.toFixed(0)} ${s.y1.toFixed(0)}L${s.x2.toFixed(0)} ${s.y2.toFixed(0)}`).join("");
      const index = level % INDEX_STEP === 0;
      // Label index contours where they cross the south-west quadrant, away from the wells.
      const anchor = { x: -7200, y: -5200 };
      const label = index
        ? segs.reduce((b, s) => {
            const m = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
            return Math.hypot(m.x - anchor.x, m.y - anchor.y) < Math.hypot(b.x - anchor.x, b.y - anchor.y) ? m : b;
          }, { x: Infinity, y: Infinity })
        : undefined;
      out.push({ level, d, index, ...(label && Number.isFinite(label.x) ? { label } : {}) });
    }
    return out;
  }, [g, lo, hi, faultXs]);

  const shade = useMemo(() => {
    const cells: { x: number; y: number; t: number }[] = [];
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) cells.push({ x: g.x0 + i * g.step, y: g.y0 + j * g.step, t: (g.values[j * g.nx + i]! - lo) / (hi - lo) });
    return cells;
  }, [g, lo, hi]);

  const active = model.wells.find((w) => w.id === model.activeWellId)!;
  const section = model.sectionOrder.map((id) => model.wells.find((w) => w.id === id)!);

  return (
    <svg width={width} height={height} className="absolute inset-0" role="img" aria-label="Structure map">
      <defs>
        <clipPath id="map-clip">
          <rect x={X(g.x0)} y={Y(y1)} width={(x1 - g.x0) * k} height={(y1 - g.y0) * k} />
        </clipPath>
      </defs>
      <rect x={X(g.x0)} y={Y(y1)} width={(x1 - g.x0) * k} height={(y1 - g.y0) * k} style={{ fill: "var(--paper)", stroke: "var(--rule-strong)" }} />
      <g clipPath="url(#map-clip)">
        {shade.map((c, i) => (
          <rect
            key={i}
            x={X(c.x - g.step / 2)}
            y={Y(c.y + g.step / 2)}
            width={g.step * k + 0.6}
            height={g.step * k + 0.6}
            style={{ fill: "var(--lith-shale)" }}
            opacity={0.03 + (1 - c.t) * 0.2}
          />
        ))}
        {/* km grid */}
        {Array.from({ length: 21 }, (_, i) => -10000 + i * 1000).map((v) => (
          <g key={v}>
            <line x1={X(v)} x2={X(v)} y1={Y(y1)} y2={Y(g.y0)} style={{ stroke: "var(--rule)" }} strokeWidth={v === 0 ? 1 : 0.6} />
            {v >= g.y0 && v <= y1 && <line x1={X(g.x0)} x2={X(x1)} y1={Y(v)} y2={Y(v)} style={{ stroke: "var(--rule)" }} strokeWidth={v === 0 ? 1 : 0.6} />}
          </g>
        ))}
        {contours.map((c) => (
          <path
            key={c.level}
            d={c.d}
            transform={`translate(${ox - g.x0 * k} ${oy + y1 * k}) scale(${k} ${-k})`}
            style={{ fill: "none", stroke: c.index ? "#a9c2b0" : "#6f8a78" }}
            strokeWidth={(c.index ? 1.2 : 0.6) / k}
            opacity={c.index ? 0.9 : 0.6}
          />
        ))}
        {contours
          .filter((c) => c.label)
          .map((c) => (
            <text
              key={`l${c.level}`}
              x={X(c.label!.x)}
              y={Y(c.label!.y) + 3.5}
              textAnchor="middle"
              className="num"
              fontSize={10}
              style={{ fill: "#b9cfbf", stroke: "var(--paper)", strokeWidth: 3.5, paintOrder: "stroke" }}
            >
              {c.level.toLocaleString("en-US")}
            </text>
          ))}
        {model.faults.map((f) => (
          <g key={f.name}>
            <line x1={X(f.x)} x2={X(f.x)} y1={Y(y1)} y2={Y(g.y0)} style={{ stroke: "#c2663a" }} strokeWidth={2} />
            {Array.from({ length: 22 }, (_, i) => g.y0 + (i + 0.5) * ((y1 - g.y0) / 22)).map((y) => (
              <line key={y} x1={X(f.x)} x2={X(f.x) + 8} y1={Y(y)} y2={Y(y)} style={{ stroke: "#c2663a" }} strokeWidth={1.3} />
            ))}
            <text x={X(f.x) + 10} y={Y(y1) + 18} className="num" fontSize={12} fontWeight={600} style={{ fill: "#e29a74" }}>
              {f.name}
            </text>
            <text x={X(f.x) + 10} y={Y(y1) + 31} className="num" fontSize={10} style={{ fill: "#b9876c" }}>
              {`${f.throwM} m down to E`}
            </text>
          </g>
        ))}
        {/* Section line A–A′ */}
        <polyline
          points={section.map((w) => `${X(w.x)},${Y(w.y)}`).join(" ")}
          style={{ fill: "none", stroke: "var(--ink)" }}
          strokeWidth={1.3}
          strokeDasharray="8 4 2 4"
          opacity={0.7}
        />
        {[
          { w: section[0]!, from: section[1]!, label: "A" },
          { w: section[section.length - 1]!, from: section[section.length - 2]!, label: "A′" },
        ].map(({ w, from, label }) => {
          // Continue the section line past its end well and letter the end there.
          const dx = X(w.x) - X(from.x);
          const dy = Y(w.y) - Y(from.y);
          const len = Math.hypot(dx, dy) || 1;
          const cx = X(w.x) + (dx / len) * 26;
          const cy = Y(w.y) + (dy / len) * 26;
          return (
            <g key={label}>
              <line x1={X(w.x)} y1={Y(w.y)} x2={cx - (dx / len) * 10} y2={cy - (dy / len) * 10} style={{ stroke: "var(--ink)" }} strokeWidth={1.3} strokeDasharray="3 3" opacity={0.7} />
              <circle cx={cx} cy={cy} r={10} style={{ fill: "var(--paper)", stroke: "var(--ink-muted)" }} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={600} style={{ fill: "var(--ink)" }}>
                {label}
              </text>
            </g>
          );
        })}
        {/* Radius ring */}
        <circle cx={X(active.x)} cy={Y(active.y)} r={radiusKm * 1000 * k} style={{ fill: "var(--ink)", stroke: "var(--ink-bright)" }} fillOpacity={0.035} strokeWidth={1.4} strokeDasharray="6 5" data-ring={radiusKm} />
        <text
          x={X(active.x) + radiusKm * 1000 * k * Math.SQRT1_2 + 6}
          y={Y(active.y) - radiusKm * 1000 * k * Math.SQRT1_2 - 6}
          fontSize={13}
          fontWeight={600}
          style={{ fill: "var(--ink-bright)", stroke: "var(--paper)", strokeWidth: 4, paintOrder: "stroke" }}
        >
          {`${radiusKm.toFixed(1)} km`}
        </text>
        {model.wells
          .filter((w) => w.role === "offset")
          .map((w) => {
            const inside = inRing.has(w.id);
            const hot = w.id === highlight;
            const isBest = w.id === best;
            const r = hot || isBest ? 6.5 : 4.5;
            return (
              <g key={w.id} onMouseEnter={() => onHover(w.id)} onMouseLeave={() => onHover(null)} style={{ cursor: "default" }} data-well={w.id}>
                {(hot || isBest) && <circle cx={X(w.x)} cy={Y(w.y)} r={14} style={{ fill: "none", stroke: isBest ? "var(--watch)" : "var(--ink-bright)" }} strokeWidth={1.6} />}
                <circle
                  cx={X(w.x)}
                  cy={Y(w.y)}
                  r={r}
                  style={{ fill: inside ? "var(--ink-bright)" : "var(--paper)", stroke: inside ? "var(--paper)" : "var(--ink-dim)" }}
                  strokeWidth={1.4}
                />
                <text
                  x={X(w.x) + 9}
                  y={Y(w.y) - 7}
                  fontSize={inside ? 12.5 : 11}
                  fontWeight={inside ? 600 : 400}
                  style={{ fill: inside ? "var(--ink-bright)" : "var(--ink-dim)", stroke: "var(--paper)", strokeWidth: 3.5, paintOrder: "stroke" }}
                >
                  {w.id}
                </text>
              </g>
            );
          })}
        <g>
          <circle cx={X(active.x)} cy={Y(active.y)} r={9} style={{ fill: "none", stroke: "var(--ink-bright)" }} strokeWidth={2} />
          <circle cx={X(active.x)} cy={Y(active.y)} r={3.5} style={{ fill: "var(--ink-bright)" }} />
          <path d={`M${X(active.x) - 15} ${Y(active.y)}h8M${X(active.x) + 7} ${Y(active.y)}h8M${X(active.x)} ${Y(active.y) - 15}v8M${X(active.x)} ${Y(active.y) + 7}v8`} style={{ stroke: "var(--ink-bright)" }} strokeWidth={1.5} />
          <text x={X(active.x) + 13} y={Y(active.y) + 20} fontSize={14} fontWeight={700} style={{ fill: "var(--ink-bright)", stroke: "var(--paper)", strokeWidth: 4, paintOrder: "stroke" }}>
            {model.activeWellId}
          </text>
        </g>
      </g>
      {/* Frame ticks, km from the active well */}
      {Array.from({ length: 11 }, (_, i) => -10000 + i * 2000).map((v) => (
        <text key={`xt${v}`} x={X(v)} y={Y(g.y0) + 16} textAnchor="middle" className="num" fontSize={10} style={{ fill: "var(--ink-dim)" }}>
          {v / 1000}
        </text>
      ))}
      {Array.from({ length: 9 }, (_, i) => -8000 + i * 2000).map((v) => (
        <text key={`yt${v}`} x={X(g.x0) - 8} y={Y(v) + 3.5} textAnchor="end" className="num" fontSize={10} style={{ fill: "var(--ink-dim)" }}>
          {v / 1000}
        </text>
      ))}
      {/* Scale bar and north arrow */}
      <g transform={`translate(${X(g.x0) + 18} ${Y(g.y0) - 22})`}>
        <rect width={2000 * k + 34} height={26} rx={2} style={{ fill: "var(--paper)" }} opacity={0.9} transform="translate(-8 -16)" />
        <rect width={1000 * k} height={5} style={{ fill: "var(--ink)" }} />
        <rect x={1000 * k} width={1000 * k} height={5} style={{ fill: "var(--paper)", stroke: "var(--ink)" }} />
        {[0, 1, 2].map((n) => (
          <text key={n} x={n * 1000 * k} y={-4} textAnchor="middle" className="num" fontSize={9.5} style={{ fill: "var(--ink-muted)" }}>
            {n === 2 ? "2 km" : n}
          </text>
        ))}
      </g>
      <g transform={`translate(${X(x1) - 26} ${Y(y1) + 30})`}>
        <path d="M0 -16 L7 6 L0 1 L-7 6 Z" style={{ fill: "var(--ink)" }} />
        <text y={20} textAnchor="middle" fontSize={11} fontWeight={600} style={{ fill: "var(--ink-muted)" }}>
          N
        </text>
      </g>
    </svg>
  );
}

export function MapScreen({ model }: { model: MapModel }) {
  const [interval, pickInterval] = useState(model.defaultInterval);
  const [radiusKm, setRadius] = useState(5);
  const [hover, setHover] = useState<string | null>(null);
  const [ref, size] = useBox<HTMLDivElement>();
  const active = model.wells.find((w) => w.id === model.activeWellId)!;
  const ranked = model.rankings[interval]!.filter((a) => a.distanceKm <= radiusKm);
  const inRing = new Set(ranked.map((a) => a.wellId));
  const outside = model.wells.filter((w) => w.role === "offset").length - ranked.length;
  const best = ranked[0]?.wellId ?? null;
  const nearest = [...ranked].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const formation = model.formations.find((f) => f.id === interval)!;
  // Satellite when there is a Google key, the drawn structure map when there is not.
  const hasKey = mapsKey() !== "";
  const [base, setBase] = useState<"satellite" | "structure">(hasKey ? "satellite" : "structure");

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_clamp(380px,24vw,470px)]">
      <section className="flex min-h-0 min-w-0 flex-col border-r border-rule">
        <div className="flex shrink-0 items-center justify-between gap-6 px-4 pt-3 pb-2.5">
          <h1 className="text-[16px] leading-none font-semibold text-ink-bright">
            Offsets around {model.activeWellId}
            <span className="ml-2.5 text-[12.5px] font-normal text-ink-muted">
              {base === "satellite" ? "Google satellite imagery, pan and zoom" : "Barail Coal-Shale top, structure contours every 10 m TVDSS"}
            </span>
          </h1>
          {hasKey ? (
            <div className="flex rounded-[4px] border border-rule-strong p-0.5" role="radiogroup" aria-label="Base map">
              {(["satellite", "structure"] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={base === b}
                  data-base={b}
                  onClick={() => setBase(b)}
                  className={`rounded-[3px] px-3 py-1 text-[12.5px] capitalize transition-colors ${
                    base === b ? "bg-ink-bright font-semibold text-[#0b0f19]" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-ink-dim">Grid in km from {model.activeWellId}</span>
          )}
        </div>
        <div ref={ref} className="relative min-h-0 flex-1">
          {size.width > 0 &&
            (base === "satellite" ? (
              <SatelliteMap model={model} radiusKm={radiusKm} inRing={inRing} highlight={hover} best={best} onHover={setHover} width={size.width} height={size.height} />
            ) : (
              <StructureMap model={model} radiusKm={radiusKm} inRing={inRing} highlight={hover} best={best} onHover={setHover} width={size.width} height={size.height} />
            ))}
        </div>
      </section>
      <aside className="flex min-h-0 flex-col gap-4 overflow-hidden bg-chrome px-4 pt-3.5 pb-3">
        <div>
          <h2 className="label-caps text-[11px] text-ink-muted">Analogue for</h2>
          <div className="mt-2 grid grid-cols-5 gap-1" role="radiogroup" aria-label="Interval">
            {model.formations.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={f.id === interval}
                data-interval={f.id}
                onClick={() => pickInterval(f.id)}
                className={`truncate rounded-[3px] border px-1 py-1.5 text-[12px] transition-colors ${
                  f.id === interval ? "border-ink-bright bg-ink-bright font-semibold text-[#0b0f19]" : "border-rule-strong text-ink-muted hover:text-ink"
                }`}
              >
                {f.short}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="label-caps text-[11px] text-ink-muted">Radius</h2>
            <span className="text-[15px] text-ink-bright">
              <span className="num">{radiusKm.toFixed(1)}</span> km
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={radiusKm}
            onChange={(e) => setRadius(Number(e.target.value))}
            aria-label="Radius in km"
            data-radius
            className="mt-2 w-full accent-[#e2e8f0]"
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="label-caps text-[11px] text-ink-muted">Ranked by geology, {formation.name}</h2>
            <span className="text-[11px] text-ink-dim">{outside} outside</span>
          </div>
          {best && nearest && best !== nearest.wellId && (
            <p className="text-[12px] leading-snug text-ink-muted">
              The nearest well, {nearest.wellId} at {nearest.distanceKm} km, is not the best match here.
            </p>
          )}
          <ol className="flex min-h-0 flex-col gap-1 overflow-y-auto">
            {ranked.map((a, i) => {
              const w = model.wells.find((x) => x.id === a.wellId)!;
              const n = model.eventCounts[a.wellId]?.[interval] ?? 0;
              const top = i === 0;
              return (
                <li
                  key={a.wellId}
                  onMouseEnter={() => setHover(a.wellId)}
                  onMouseLeave={() => setHover(null)}
                  data-rank={i + 1}
                  data-well={a.wellId}
                  className={`grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-[3px] px-2.5 py-2 ${hover === a.wellId ? "bg-accent" : ""}`}
                  style={{ boxShadow: top ? "inset 3px 0 0 var(--watch)" : undefined, background: top && hover !== a.wellId ? "color-mix(in srgb, var(--watch) 7%, transparent)" : undefined }}
                >
                  <span className="num text-[13px] text-ink-dim">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[15px] font-semibold text-ink-bright">{a.wellId}</span>
                      {top && <span className="label-caps text-[9.5px] text-watch">Best analogue</span>}
                    </div>
                    <div className="num mt-0.5 truncate text-[11px] text-ink-muted">
                      Δ top {a.components.depthDeltaM} m · Δ thick {a.components.isopachDeltaM} m · {a.components.sameBlock ? "same block" : "across F1"}
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-rule">
                      <div className="h-full" style={{ width: `${a.score * 100}%`, background: top ? "var(--watch)" : "var(--ink-muted)" }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-[15px] text-ink-bright">{a.score.toFixed(2)}</div>
                    <div className="num text-[11px] text-ink-muted">
                      {a.distanceKm} km {bearingOf(w.x - active.x, w.y - active.y)}
                    </div>
                    <div className="text-[11px] text-ink-dim">
                      {n} {n === 1 ? "event" : "events"} · {w.spudYear}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="shrink-0 text-[11px] leading-snug text-ink-dim">
          Score weighs structural position 30%, thickness 35%, fault block 20% and interbeds 15%. Distance is shown, not scored.
        </p>
      </aside>
    </div>
  );
}
