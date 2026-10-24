"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { easeInOut, project, seg, T } from "@/lib/arrival";
import type { ArrivalData } from "@/lib/data";
import { KIND_COLOR } from "@/lib/hazards";

/** The arrival's drawn pieces: report pages, falling chips, captions and the keyless grid. */

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Where a chip sits around its well once it has landed: a small ring, first incident at the top. */
export function chipSlot(j: number, n: number) {
  const r = n > 8 ? 19 : 15;
  const a = -Math.PI / 2 + (2 * Math.PI * j) / Math.max(n, 1);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/** When chip j of section well i leaves the ground for the section face. */
export function fallStart(i: number, j: number) {
  return T.chipsFallStart + i * 0.34 + j * 0.07;
}

export function Page({ at, lift, scan, fold }: { at: { x: number; y: number }; lift: number; scan: number; fold: number }) {
  const s = (0.8 + 0.6 * lift) * (1 - fold);
  const w = 20;
  const h = 26;
  return (
    <g transform={`translate(${at.x} ${at.y}) scale(${s})`} opacity={Math.min(1, lift * 2) * (1 - fold * 0.4)}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1.2} fill="#f1f5f9" stroke="#020617" strokeWidth={0.8} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={-w / 2 + 3} y={-h / 2 + 4 + i * 4.2} width={i === 4 ? 8 : 14} height={1.4} fill="#64748b" />
      ))}
      {scan > 0 && scan < 1 && (
        <rect x={-w / 2 - 2} y={-h / 2 + h * scan - 0.9} width={w + 4} height={1.8} fill="#22d3ee" style={{ filter: "drop-shadow(0 0 3px #22d3ee)" }} />
      )}
    </g>
  );
}

/** Chips of the five section wells falling from the ground into the face, at the depth each happened. */
export function FallingChips({
  t,
  data,
  sectionIds,
  target,
}: {
  t: number;
  data: ArrivalData;
  sectionIds: string[];
  target: (wellId: string, md: number) => { inWindow: boolean };
}) {
  const box = useRef<HTMLDivElement>(null);
  const chips = useMemo(
    () =>
      sectionIds.flatMap((id, i) =>
        (data.wells.find((w) => w.id === id)?.events ?? []).map((e, j) => ({ ...e, wellId: id, start: fallStart(i, j), inWindow: target(id, e.md).inWindow })),
      ),
    [data.wells, sectionIds, target],
  );
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    for (const c of chips) {
      const el = root.querySelector<HTMLElement>(`[data-fall='${c.id}']`);
      if (!el) continue;
      const k = seg(t, c.start, c.start + T.chipsFallFor);
      if (k <= 0 || t >= T.flattenEnd) {
        el.style.opacity = "0";
        continue;
      }
      const from = document.querySelector(`[data-chip='${c.id}']`)?.getBoundingClientRect();
      const to = document.querySelector(`[data-land='${c.id}']`)?.getBoundingClientRect();
      if (!from || !to) continue;
      // Falls with gravity: slow off the ground, fast into the rock.
      const e = k * k;
      const x = lerp(from.x + from.width / 2, to.x, easeInOut(k));
      const y = lerp(from.y + from.height / 2, to.y, e);
      const fade = c.inWindow ? 1 - seg(t, T.tiltEnd + 1.5, T.flattenEnd - 0.8) : 1 - seg(k, 0.35, 0.8);
      el.style.opacity = String(fade);
      el.style.transform = `translate(${x - 5}px, ${y - 5}px) scale(${c.inWindow && k >= 1 ? 1.25 : 1})`;
    }
  });
  return (
    <div ref={box} className="pointer-events-none absolute inset-0" aria-hidden>
      {chips.map((c) => (
        <div
          key={c.id}
          data-fall={c.id}
          className="absolute top-0 left-0 size-[10px] rounded-full"
          style={{ background: KIND_COLOR[c.kind], boxShadow: `0 0 0 1.5px #020617, 0 0 12px ${KIND_COLOR[c.kind]}`, opacity: 0 }}
        />
      ))}
    </div>
  );
}

export function FlyCaptions({ t }: { t: number }) {
  // "Upper Assam" arrives with the camera, not over Nepal.
  const a = seg(t, 4.2, 5) * (1 - seg(t, 10.8, 11.6));
  const b = seg(t, 6.2, 7) * (1 - seg(t, 10.8, 11.6));
  if (a <= 0) return null;
  return (
    <div className="absolute bottom-16 left-10 max-w-[620px]" data-fly-caption>
      <div style={{ opacity: a }}>
        <div className="text-[46px] leading-none font-bold tracking-[0.02em] text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.7)]">Upper Assam</div>
        <div className="mt-2 text-[19px] text-white/90 [text-shadow:0_1px_10px_rgba(0,0,0,0.8)]">South bank of the Brahmaputra</div>
      </div>
      <div className="mt-5 inline-block rounded-[5px] bg-[#020617]/78 px-4 py-2.5" style={{ opacity: b }} data-fly-1867>
        <div className="text-[17px] text-white">
          India&apos;s first oil well was drilled here in <span className="num font-semibold">1867</span>
        </div>
        <div className="mt-0.5 text-[12.5px] text-white/65">Namdang, Assam · USGS Bulletin 2208-D, Wandrey 2004</div>
      </div>
    </div>
  );
}

/** The ground without a Google key: a 1 km grid around the field, drawn with the same camera. */
export function GridGround({ centre, range, heading, W, H }: { centre: { x: number; y: number }; range: number; heading: number; W: number; H: number }) {
  const P = (x: number, y: number) => project(x, y, centre, range, heading, W, H);
  const lines = Array.from({ length: 25 }, (_, i) => (i - 12) * 1000);
  return (
    <svg className="absolute inset-0" width={W} height={H} aria-hidden>
      {lines.flatMap((v) => {
        const [a, b, c, d] = [P(v, -12_000), P(v, 12_000), P(-12_000, v), P(12_000, v)];
        return [
          <line key={`x${v}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#16213a" />,
          <line key={`y${v}`} x1={c.x} y1={c.y} x2={d.x} y2={d.y} stroke="#16213a" />,
        ];
      })}
    </svg>
  );
}
