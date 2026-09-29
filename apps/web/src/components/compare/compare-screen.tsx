"use client";

import type { CurvePoint, HoleSection, MudStep, OffsetEvent, WellRole } from "@wells/correlate";
import { useLayoutEffect, useRef, useState } from "react";
import { useConsole } from "@/components/console/console-provider";
import { metres } from "@/lib/format";

export interface CompareModel {
  activeWellId: string;
  wells: {
    id: string;
    role: WellRole;
    spudDate: string;
    tdMd: number;
    curve: CurvePoint[];
    planCurve: CurvePoint[] | null;
    sections: HoleSection[];
    mud: MudStep[];
    events: OffsetEvent[];
  }[];
}

/** Offsets get quiet, distinct inks; amber and red stay reserved for alerts. */
const INKS = ["#7dd3c0", "#93b4e6", "#d7b98a", "#c4a7e7"];
const DEPTH_MAX = 4800;

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

/** Day the curve first reaches a depth. */
function dayAt(curve: CurvePoint[], md: number): number {
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    if (b.md >= md) return b.md === a.md ? a.day : a.day + ((md - a.md) / (b.md - a.md)) * (b.day - a.day);
  }
  return curve[curve.length - 1]!.day;
}

const npt = (events: OffsetEvent[]) => events.reduce((s, e) => s + e.nptHours, 0);

function Chart({ model, width, height, hover, setHover }: { model: CompareModel; width: number; height: number; hover: string | null; setHover: (id: string | null) => void }) {
  const { openEvent } = useConsole();
  const pad = { l: 64, r: 18, t: 16, b: 38 };
  const maxDay = Math.ceil(Math.max(...model.wells.flatMap((w) => [w.curve.at(-1)!.day, w.planCurve?.at(-1)?.day ?? 0])) / 5) * 5;
  const X = (d: number) => pad.l + (d / maxDay) * (width - pad.l - pad.r);
  const Y = (md: number) => pad.t + (md / DEPTH_MAX) * (height - pad.t - pad.b);
  const path = (c: CurvePoint[]) => c.map((p, i) => `${i ? "L" : "M"}${X(p.day).toFixed(1)} ${Y(p.md).toFixed(1)}`).join("");
  const offsets = model.wells.filter((w) => w.role === "offset");
  const active = model.wells.find((w) => w.role === "active")!;
  return (
    <svg width={width} height={height} className="absolute inset-0" role="img" aria-label="Days versus depth">
      <rect x={pad.l} y={pad.t} width={width - pad.l - pad.r} height={height - pad.t - pad.b} style={{ fill: "var(--paper)" }} />
      {Array.from({ length: maxDay / 5 + 1 }, (_, i) => i * 5).map((d) => (
        <g key={d}>
          <line x1={X(d)} x2={X(d)} y1={pad.t} y2={height - pad.b} style={{ stroke: "var(--rule)" }} />
          <text x={X(d)} y={height - pad.b + 16} textAnchor="middle" className="num" fontSize={11} style={{ fill: "var(--ink-muted)" }}>
            {d}
          </text>
        </g>
      ))}
      {Array.from({ length: DEPTH_MAX / 500 + 1 }, (_, i) => i * 500).map((m) => (
        <g key={m}>
          <line x1={pad.l} x2={width - pad.r} y1={Y(m)} y2={Y(m)} style={{ stroke: m % 1000 ? "var(--rule)" : "var(--rule-strong)" }} />
          <text x={pad.l - 8} y={Y(m) + 3.5} textAnchor="end" className="num" fontSize={11} style={{ fill: "var(--ink-muted)" }}>
            {m.toLocaleString("en-US")}
          </text>
        </g>
      ))}
      <text x={(pad.l + width - pad.r) / 2} y={height - 4} textAnchor="middle" fontSize={11} className="label-caps" style={{ fill: "var(--ink-dim)" }}>
        Days from spud
      </text>
      <text transform={`translate(14 ${(pad.t + height - pad.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} className="label-caps" style={{ fill: "var(--ink-dim)" }}>
        Depth, m MD
      </text>
      {offsets.map((w, i) => (
        <path
          key={w.id}
          d={path(w.curve)}
          style={{ fill: "none", stroke: INKS[i % INKS.length] }}
          strokeWidth={hover === w.id ? 2.6 : 1.6}
          opacity={hover && hover !== w.id ? 0.35 : 0.95}
          strokeLinejoin="round"
        />
      ))}
      {active.planCurve && <path d={path(active.planCurve)} style={{ fill: "none", stroke: "var(--ink-bright)" }} strokeWidth={1.6} strokeDasharray="7 5" opacity={0.85} />}
      <path d={path(active.curve)} style={{ fill: "none", stroke: "var(--ink-bright)" }} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={X(active.curve.at(-1)!.day)} cy={Y(active.curve.at(-1)!.md)} r={5} style={{ fill: "var(--ink-bright)" }} />
      <text x={X(active.curve.at(-1)!.day) + 10} y={Y(active.curve.at(-1)!.md) + 4} className="num" fontSize={12} fontWeight={600} style={{ fill: "var(--ink-bright)", stroke: "var(--paper)", strokeWidth: 4, paintOrder: "stroke" }}>
        {`${model.activeWellId} now, ${metres(active.curve.at(-1)!.md)} m`}
      </text>
      {offsets.map((w, i) =>
        w.events.map((e) => {
          const r = 3 + Math.sqrt(e.nptHours) * 1.9;
          const x = X(dayAt(w.curve, e.md));
          const y = Y(e.md);
          const big = e.nptHours >= 30;
          return (
            <g key={e.id} onClick={() => openEvent(e)} onMouseEnter={() => setHover(w.id)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }} data-npt={e.id}>
              <circle cx={x} cy={y} r={r} style={{ fill: INKS[i % INKS.length], stroke: INKS[i % INKS.length] }} fillOpacity={0.22} strokeWidth={1.2} opacity={hover && hover !== w.id ? 0.35 : 1} />
              {big && (
                <text x={x + r + 4} y={y + 4} className="num" fontSize={10.5} style={{ fill: "var(--ink)", stroke: "var(--paper)", strokeWidth: 3, paintOrder: "stroke" }}>
                  {`${Math.round(e.nptHours)} h`}
                </text>
              )}
              <title>{`${w.id} · ${e.title} · ${metres(e.md, 1)} m · NPT ${e.nptHours} h`}</title>
            </g>
          );
        }),
      )}
    </svg>
  );
}

/** Casing schematic and mud weight for one well on the shared depth axis. */
function Program({ w, ink, height, top }: { w: CompareModel["wells"][number]; ink: string; height: number; top: number }) {
  const width = 112;
  const Y = (md: number) => top + (md / DEPTH_MAX) * (height - top - 38);
  const casings = w.sections.map((s, i) => ({ ...s, inset: 12 + i * 8, top: s.sizeIn === "8½" ? w.sections[i - 1]!.shoeMd - 120 : 0 }));
  const mwX = (ppg: number) => 58 + ((ppg - 8.5) / (13 - 8.5)) * 48;
  const steps = [...w.mud].sort((a, b) => a.fromMd - b.fromMd).filter((s) => s.fromMd < w.tdMd);
  let d = "";
  steps.forEach((s, i) => {
    const next = steps[i + 1]?.fromMd ?? w.tdMd;
    d += `${i ? "L" : "M"}${mwX(s.ppg)} ${Y(s.fromMd)}L${mwX(s.ppg)} ${Y(next)}`;
  });
  return (
    <svg width={width} height={height} className="shrink-0" aria-label={`${w.id} casing and mud`}>
      <rect x={4} y={top} width={width - 8} height={height - top - 38} style={{ fill: "var(--paper)" }} />
      {casings.map((c) => (
        <g key={c.sizeIn}>
          <line x1={c.inset} x2={c.inset} y1={Y(c.top)} y2={Y(c.shoeMd)} style={{ stroke: ink }} strokeWidth={1.6} />
          <path d={`M${c.inset} ${Y(c.shoeMd)} l6 0 l-6 -7 Z`} style={{ fill: ink }} />
          <text x={c.inset + 8} y={Y(c.shoeMd) + 3.5} className="num" fontSize={9.5} style={{ fill: "var(--ink)", stroke: "var(--paper)", strokeWidth: 3, paintOrder: "stroke" }}>
            {c.casingIn.replace(" liner", " L")}
          </text>
        </g>
      ))}
      <line x1={mwX(10)} x2={mwX(10)} y1={top} y2={height - 38} style={{ stroke: "var(--rule-strong)" }} strokeDasharray="2 3" />
      <path d={d} style={{ fill: "none", stroke: "var(--ink-bright)" }} strokeWidth={1.4} opacity={0.85} />
      <text x={30} y={height - 14} textAnchor="middle" fontSize={9.5} className="label-caps" style={{ fill: "var(--ink-dim)" }}>
        casing
      </text>
      <text x={mwX(10.5)} y={height - 14} textAnchor="middle" fontSize={9.5} className="label-caps" style={{ fill: "var(--ink-dim)" }}>
        mud
      </text>
    </svg>
  );
}

export function CompareScreen({ model }: { model: CompareModel }) {
  const [ref, size] = useBox<HTMLDivElement>();
  const [progRef, progSize] = useBox<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const offsets = model.wells.filter((w) => w.role === "offset");
  const active = model.wells.find((w) => w.role === "active")!;
  const inkOf = (id: string) => (id === model.activeWellId ? "var(--ink-bright)" : INKS[offsets.findIndex((w) => w.id === id) % INKS.length]!);
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_auto]">
      <section className="flex min-h-0 min-w-0 flex-col border-r border-rule">
        <div className="flex shrink-0 items-center justify-between gap-6 px-4 pt-3.5 pb-2.5">
          <h1 className="text-[16px] leading-none font-semibold text-ink-bright">
            Days versus depth
            <span className="ml-2.5 text-[12.5px] font-normal text-ink-muted">section offsets as drilled, {model.activeWellId} plan and progress, NPT as bubbles</span>
          </h1>
          <div className="flex items-center gap-4 text-[12px] text-ink-muted">
            {offsets.map((w) => (
              <span key={w.id} className="flex items-center gap-1.5" onMouseEnter={() => setHover(w.id)} onMouseLeave={() => setHover(null)}>
                <span className="h-0.5 w-5" style={{ background: inkOf(w.id) }} />
                {w.id} <span className="num text-ink-dim">{w.curve.at(-1)!.day.toFixed(1)} d</span>
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-5 border-t-2 border-dashed border-ink-bright" />
              {model.activeWellId} plan <span className="num text-ink-dim">{active.planCurve?.at(-1)?.day.toFixed(1)} d</span>
            </span>
          </div>
        </div>
        <div ref={ref} className="relative min-h-0 flex-1">
          {size.width > 0 && <Chart model={model} width={size.width} height={size.height} hover={hover} setHover={setHover} />}
        </div>
      </section>
      <aside className="flex min-h-0 flex-col bg-chrome px-4 pt-3.5 pb-3">
        <h2 className="label-caps text-[11px] text-ink-muted">Casing and mud programs</h2>
        <div ref={progRef} className="mt-2 flex min-h-0 flex-1 gap-1.5">
          {model.wells.map((w) => {
            const hrs = npt(w.events);
            return (
              <div key={w.id} className="flex min-h-0 flex-col" onMouseEnter={() => setHover(w.id === model.activeWellId ? null : w.id)} onMouseLeave={() => setHover(null)}>
                <div className="h-[60px] px-1">
                  <div className="text-[14px] font-semibold" style={{ color: inkOf(w.id) }}>
                    {w.id}
                  </div>
                  <div className="num text-[10.5px] text-ink-muted">{w.role === "active" ? "plan" : `${w.spudDate.slice(0, 4)} · NPT ${Math.round(hrs)} h`}</div>
                  <div className="num text-[10.5px] text-ink-dim">
                    MW {w.mud[0]?.ppg.toFixed(1)}–{Math.max(...w.mud.map((m) => m.ppg)).toFixed(1)}
                  </div>
                </div>
                {progSize.height > 0 && <Program w={w} ink={inkOf(w.id)} height={progSize.height - 60} top={0} />}
              </div>
            );
          })}
        </div>
        <table className="mt-3 w-full text-left">
          <thead>
            <tr className="border-b border-rule-strong">
              <th className="label-caps py-1.5 text-[9.5px] text-ink-dim">Shoe m MD</th>
              {model.wells.map((w) => (
                <th key={w.id} className="num py-1.5 text-right text-[10.5px]" style={{ color: inkOf(w.id) }}>
                  {w.id.slice(3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.sections.slice(0, 3).map((s, i) => (
              <tr key={s.casingIn} className="border-b border-rule">
                <td className="num py-1.5 text-[11.5px] text-ink-muted">{s.casingIn} in</td>
                {model.wells.map((w) => (
                  <td key={w.id} className="num py-1.5 text-right text-[12px] text-ink">
                    {metres(w.sections[i]!.shoeMd)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </div>
  );
}
