"use client";

import { displayAtMd } from "@wells/correlate";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useConsole } from "@/components/console/console-provider";
import { layoutSection } from "@/components/section/layout";
import { CorrelationPanel } from "@/components/section/correlation-panel";
import { cameraAt, centreAt, cutAway, easeInOut, easeOut, faceSwing, groundTilt, metresPerPixel, project, readPhase, seg, T } from "@/lib/arrival";
import type { ArrivalData } from "@/lib/data";
import { mapsKey } from "@/lib/google-maps";
import { useViewport } from "@/hooks/use-viewport";
import { KIND_COLOR, KIND_LABEL } from "@/lib/hazards";
import { useSatellite } from "./satellite";
import { chipSlot, fallStart, FallingChips, FlyCaptions, GridGround, lerp, Page } from "./scenery";

interface ArrivalApi {
  /** Draws the arrival at t seconds and moves the map camera there. */
  at: (t: number) => void;
  /** True once the map has finished loading the tiles for the current camera. */
  steady: () => boolean;
  ready: () => boolean;
  duration: number;
}

const RING_M = 5000;
const noSubscribe = () => () => undefined;
/** Set before hydration by the root layout when the page is being filmed. */
const isFilm = () => document.documentElement.dataset.film === "1";
const PERSPECTIVE = 1300;
const lerpPt = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

/**
 * The arrival between "Open well" and the section: a flight down to the field on Google's 3D
 * satellite map, the offsets and their reports read into incidents, then the ground cut along A to
 * A' into the correlation section. It covers the console and hands over to it when it ends.
 * With `?film=1` it waits for the film script to drive `window.__arrival.at(t)`.
 */
export function Arrival({ data }: { data: ArrivalData }) {
  const { model, scene } = useConsole();
  const { w: W, h: H } = useViewport();
  // Without a Google key there is nothing to fly over, so the arrival starts at the field.
  const [t, setT] = useState(() => (mapsKey() ? 0 : T.flyEnd));
  const [done, setDone] = useState(false);
  const film = useSyncExternalStore(noSubscribe, isFilm, () => false);
  const hasKey = mapsKey() !== "";
  const [panel, setPanel] = useState<DOMRect | null>(null);

  const byId = useMemo(() => new Map(data.wells.map((w) => [w.id, w])), [data.wells]);
  const sectionIds = data.sectionOrder;
  const lineEnds = useMemo(() => ({ a: byId.get(sectionIds[0]!)!, b: byId.get(sectionIds[sectionIds.length - 1]!)! }), [byId, sectionIds]);
  const offsets = useMemo(() => data.wells.filter((w) => w.role === "offset").sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)), [data.wells]);
  const readIndex = useMemo(() => new Map(offsets.map((w, i) => [w.id, i])), [offsets]);
  // The Google 3D map. Without a key, or if it fails to load, the arrival starts at the field.
  const { mapBox, mapReady, steady, applyCamera } = useSatellite(hasKey, data.anchor, lineEnds, () => setT(T.flyEnd));

  const finish = useCallback(() => {
    setDone(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("arrive");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  // The section panel the arrival lands on, measured from the console underneath.
  useEffect(() => {
    const el = document.querySelector("[data-section-panel] > div");
    if (!el) return;
    const ro = new ResizeObserver(() => setPanel(el.getBoundingClientRect()));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Live: play in real time. Film: hand the clock to the film script.
  useEffect(() => {
    if (!mapReady || done) return;
    if (film) {
      const api: ArrivalApi = {
        at: (time) => {
          applyCamera(time);
          setT(time);
          if (time >= T.end) finish();
        },
        steady: () => steady.current,
        ready: () => true,
        duration: T.end,
      };
      (window as unknown as { __arrival?: ArrivalApi }).__arrival = api;
      return () => {
        delete (window as unknown as { __arrival?: ArrivalApi }).__arrival;
      };
    }
    let raf = 0;
    let start: number | null = null;
    const from = hasKey ? 0 : T.flyEnd;
    const loop = (now: number) => {
      start ??= now;
      const time = from + (now - start) / 1000;
      applyCamera(time);
      setT(time);
      if (time >= T.end) finish();
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [mapReady, done, film, hasKey, applyCamera, finish, steady]);

  // The five section wells as the section draws them, for the cut face and the chips' landing places.
  const face = useMemo(() => {
    if (!panel) return null;
    // The panel measures itself in whole pixels, so the face does too and both draw the same section.
    const w = Math.floor(panel.width);
    const h = Math.floor(panel.height);
    const L = layoutSection(w, h, model.wells, model.activeWellId, model.window);
    const column = new Map(L.wells.map((w) => [w.well.id, (w.lith.x0 + w.lith.x1) / 2]));
    const byWell = new Map(model.wells.map((w) => [w.id, w]));
    const target = (wellId: string, md: number) => {
      const d = displayAtMd(byWell.get(wellId)!, md, model.datumRt);
      const inWindow = d >= L.windowTop && d <= L.windowBottom;
      // Incidents above or below the drawn window head for its edge and fade there, never up out of the rock.
      const y = Math.min(L.drawBottom, Math.max(L.drawTop, L.y(d)));
      return { x: column.get(wellId)!, y, inWindow };
    };
    return { L, column, target, w, h };
  }, [panel, model]);

  if (done) return null;

  // Straight-down camera after the fly-in, in field metres, and the projection it gives.
  const cam = cameraAt(t, data.anchor, { a: lineEnds.a, b: lineEnds.b });
  const centre = centreAt(t, { a: lineEnds.a, b: lineEnds.b });
  const P = (x: number, y: number) => project(x, y, centre, cam.range, cam.heading, W, H);
  const mpp = metresPerPixel(cam.range, H);
  const overlay = t >= T.flyEnd;

  // Where the five section wells step to on the cut line: the section's own columns, scaled.
  const aScr = P(lineEnds.a.x, lineEnds.a.y);
  const bScr = P(lineEnds.b.x, lineEnds.b.y);
  const colA = face?.column.get(lineEnds.a.id) ?? 0;
  const colB = face?.column.get(lineEnds.b.id) ?? 1;
  const s0 = face ? Math.hypot(bScr.x - aScr.x, bScr.y - aScr.y) / (colB - colA) : 1;
  const origin = face ? { x: aScr.x + (face.w / 2 - colA) * s0, y: (aScr.y + bScr.y) / 2 } : { x: W / 2, y: H / 2 };
  const snap = easeInOut(seg(t, T.alignEnd, T.snapEnd));
  const wellAt = (w: ArrivalData["wells"][number]) => {
    const p = P(w.x, w.y);
    if (!face || !sectionIds.includes(w.id) || snap === 0) return p;
    const onLine = { x: aScr.x + ((face.column.get(w.id) ?? colA) - colA) * s0, y: origin.y };
    return lerpPt(p, onLine, snap);
  };

  // The cut: the ground tilts about the line and the section face swings down from it.
  const theta = groundTilt(t);
  const liftK = easeInOut(seg(t, T.snapEnd, T.tiltEnd));
  const flatK = easeInOut(seg(t, T.tiltEnd, T.flattenEnd));
  const panelTop = panel ? { x: panel.left + panel.width / 2, y: panel.top } : origin;
  const raised = { x: 0, y: -0.2 * H * liftK };
  const delta = lerpPt(raised, { x: panelTop.x - origin.x, y: panelTop.y - origin.y }, flatK);
  const k = lerp(1, 1 / s0, flatK);
  const groundTransform = `translate(${delta.x}px, ${delta.y}px) scale(${k}) perspective(${PERSPECTIVE}px) rotateX(${theta}deg)`;
  const swing = faceSwing(t);
  const faceTransform = `translate(${delta.x}px, ${delta.y}px) scale(${k * s0}) perspective(${PERSPECTIVE / s0}px) rotateX(${swing - 90}deg)`;
  const cut = cutAway(t);
  const groundFade = 1 - seg(theta, 70, 88);
  const backdrop = 1 - seg(t, T.flattenEnd - 1.6, T.flattenEnd);

  const inRing = (w: { x: number; y: number }) => Math.hypot(w.x, w.y) <= RING_M;
  const insideCount = offsets.filter(inRing).length;
  const others = 1 - seg(t, T.alignStart, T.alignStart + 1.2);
  let wellsRead = 0;
  let reportsRead = 0;
  let incidents = 0;
  for (const [i, w] of offsets.entries()) {
    const r = readPhase(t, i);
    if (r.readDone) {
      wellsRead++;
      reportsRead += w.reports;
    }
    if (r.landed) incidents += w.events.length;
  }
  const kinds = [...new Set(offsets.flatMap((w) => w.events.map((e) => e.kind)))];

  const wellsIn = seg(t, T.wellsIn, T.wellsIn + 1.4);
  const ringK = easeInOut(seg(t, T.ringIn, T.ringIn + 1.6));
  const insideK = seg(t, T.insideIn, T.insideIn + 0.8);
  const cardsK = seg(t, T.wellsIn + 0.4, T.wellsIn + 1.2) * others;
  const counterK = seg(t, T.readStart - 0.6, T.readStart) * others;
  const lineK = easeInOut(seg(t, T.alignStart + 0.6, T.alignEnd));
  const ringCentre = P(0, 0);

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden" data-arrival data-arrival-t={t.toFixed(3)}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 30%, #0b1a33 0%, var(--bg) 62%)", opacity: backdrop }} />

      {/* The ground: the satellite map and everything pinned to it, tilted as one plane. */}
      <div
        className="absolute inset-0"
        style={{
          transform: overlay ? groundTransform : undefined,
          transformOrigin: `${origin.x}px ${origin.y}px`,
          opacity: groundFade,
          maskImage:
            cut > 0
              ? `linear-gradient(to bottom, rgba(0,0,0,${1 - 0.9 * cut}) 0, #000 ${0.28 * H}px, #000 ${origin.y}px, rgba(0,0,0,${1 - cut}) ${origin.y + 0.5}px)`
              : undefined,
        }}
        data-ground
      >
        <div ref={mapBox} className="absolute inset-0 bg-[#050b18]" />
        {!hasKey && overlay && <GridGround centre={centre} range={cam.range} heading={cam.heading} W={W} H={H} />}
        <div className="absolute inset-0" style={{ background: "#020617", opacity: 0.38 * seg(t, T.flyEnd - 0.6, T.flyEnd + 0.4) }} />
        {overlay && (
          <svg className="absolute inset-0" width={W} height={H} aria-hidden>
            <defs>
              <filter id="arr-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>
            {/* The 5 km ring. */}
            <g opacity={ringK > 0 ? others : 0}>
              <circle
                cx={ringCentre.x}
                cy={ringCentre.y}
                r={RING_M / mpp}
                fill="none"
                stroke="#f8fafc"
                strokeWidth={5}
                opacity={0.18}
                filter="url(#arr-glow)"
                pathLength={1}
                strokeDasharray={`${ringK} 1`}
                transform={`rotate(-90 ${ringCentre.x} ${ringCentre.y})`}
              />
              <circle
                cx={ringCentre.x}
                cy={ringCentre.y}
                r={RING_M / mpp}
                fill="none"
                stroke="#f8fafc"
                strokeWidth={1.6}
                pathLength={1}
                strokeDasharray={`${ringK} 1`}
                transform={`rotate(-90 ${ringCentre.x} ${ringCentre.y})`}
              />
              <g opacity={seg(ringK, 0.85, 1)}>
                {/* On top of the ring, clear of the wells that sit near its east and west edges. */}
                <rect x={ringCentre.x - 23} y={ringCentre.y - RING_M / mpp - 34} width={46} height={24} rx={3} fill="#020617" opacity={0.78} />
                <text x={ringCentre.x} y={ringCentre.y - RING_M / mpp - 16.5} textAnchor="middle" fontSize={14} fontWeight={600} fill="#f8fafc">
                  5 km
                </text>
              </g>
            </g>
            {/* A to A': the five wells of the section, joined west to east. */}
            {lineK > 0 && (
              <g>
                <polyline
                  points={sectionIds
                    .map((id) => wellAt(byId.get(id)!))
                    .map((p) => `${p.x},${p.y}`)
                    .join(" ")}
                  fill="none"
                  stroke="#f8fafc"
                  strokeWidth={2 + 1.5 * cut}
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray={`${lineK} 1`}
                />
                {[
                  [aScr, "A"],
                  [bScr, "A′"],
                ].map(([p, label]) => {
                  const q = p as { x: number; y: number };
                  const dx = label === "A" ? -30 : 30;
                  return (
                    <g key={label as string} opacity={lineK * (1 - cut)}>
                      <circle cx={q.x + dx} cy={q.y} r={12} fill="#020617" opacity={0.8} stroke="#f8fafc" strokeWidth={1.2} />
                      <text x={q.x + dx} y={q.y + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} fill="#f8fafc">
                        {label as string}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
            {/* Wells, their reports being read, and the incidents they left. */}
            {data.wells.map((w) => {
              const idx = readIndex.get(w.id);
              const onSection = sectionIds.includes(w.id);
              const fade = onSection ? 1 : others;
              const i = w.role === "active" ? -1 : idx!;
              const d = Math.hypot(w.x, w.y);
              const appear = easeOut(seg(wellsIn, (d / 10_000) * 0.6, (d / 10_000) * 0.6 + 0.4));
              if (appear <= 0 || fade <= 0) return null;
              const p = wellAt(w);
              const inside = w.role === "offset" && inRing(w);
              const lit = w.role === "active" ? 1 : inside ? lerp(0.75, 1, insideK) : lerp(0.75, 0.45, insideK);
              const r = i >= 0 ? readPhase(t, i) : null;
              const pageAt = { x: p.x, y: p.y - 38 * (r?.lift ?? 0) };
              const showLabel = w.role === "active" || (inside && insideK > 0) || (onSection && t >= T.alignStart);
              return (
                <g key={w.id} opacity={appear * fade}>
                  {r &&
                    w.events.map((e, j) => {
                      if (r.fold <= 0) return null;
                      const slot = chipSlot(j, w.events.length);
                      const at = lerpPt(pageAt, { x: p.x + slot.x, y: p.y + slot.y }, r.drop);
                      const falling = onSection && t >= fallStart(sectionIds.indexOf(w.id), j);
                      return (
                        <circle
                          key={e.id}
                          cx={at.x}
                          cy={at.y}
                          r={4.4 * Math.min(1, r.fold * 1.4)}
                          fill={KIND_COLOR[e.kind]}
                          stroke="#020617"
                          strokeWidth={1}
                          opacity={falling ? 0 : 1}
                          data-chip={e.id}
                        />
                      );
                    })}
                  {w.role === "active" ? (
                    <g>
                      <circle cx={p.x} cy={p.y} r={15} fill="#ef4444" opacity={0.25} />
                      <circle cx={p.x} cy={p.y} r={8} fill="#ef4444" stroke="#f8fafc" strokeWidth={2.4} />
                    </g>
                  ) : (
                    <circle cx={p.x} cy={p.y} r={inside || onSection ? 6.2 : 4.8} fill="#fbbf24" stroke="#020617" strokeWidth={1.6} opacity={lit} />
                  )}
                  {showLabel && (
                    <text
                      x={p.x + (w.role === "active" ? 17 : 11)}
                      y={p.y - (w.role === "active" ? 12 : 9)}
                      fontSize={w.role === "active" ? 19 : 14.5}
                      fontWeight={w.role === "active" ? 700 : 600}
                      fill="#f8fafc"
                      stroke="#020617"
                      strokeWidth={3.5}
                      paintOrder="stroke"
                      opacity={w.role === "active" ? 1 : Math.max(insideK, onSection ? lineK : 0)}
                    >
                      {w.id}
                    </text>
                  )}
                  {r && r.lift > 0 && r.fold < 1 && <Page at={pageAt} lift={r.lift} scan={r.scan} fold={r.fold} />}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* The section, hanging from the cut line; it lands exactly on the console's own panel. */}
      {face && t >= T.snapEnd && (
        <div
          className="absolute flex flex-col"
          style={{
            left: origin.x - face.w / 2,
            top: origin.y,
            width: face.w,
            height: face.h,
            transform: faceTransform,
            transformOrigin: "50% 0",
            background: "var(--bg)",
            boxShadow: flatK < 1 ? "0 -2px 0 #f8fafc, 0 30px 80px rgba(0,0,0,0.6)" : undefined,
          }}
          data-arrival-face
        >
          <CorrelationPanel model={model} scene={scene} onOpen={() => undefined} />
          {sectionIds.flatMap((id) =>
            byId.get(id)!.events.map((e) => {
              const p = face.target(id, e.md);
              return <div key={e.id} className="absolute size-px" style={{ left: p.x, top: p.y }} data-land={e.id} />;
            }),
          )}
        </div>
      )}
      {face && <FallingChips t={t} data={data} sectionIds={sectionIds} target={face.target} />}

      {/* Opens from the dark of the home screen. */}
      <div className="absolute inset-0" style={{ background: "var(--bg)", opacity: 1 - seg(t, 0, 0.9) }} />

      {/* Words on the screen, not on the ground. */}
      <FlyCaptions t={t} />
      {overlay && cardsK > 0 && (
        <div className="absolute top-8 left-9 rounded-[6px] bg-[#020617]/82 px-5 py-4 backdrop-blur-sm" style={{ opacity: cardsK }} data-arrival-title>
          <div className="flex items-baseline gap-3">
            <span className="text-[34px] leading-none font-bold text-ink-bright">{data.activeWellId}</span>
            <span className="label-caps text-[12px] text-[#f87171]">Drilling</span>
          </div>
          <div className="mt-2 text-[15px] text-ink">{data.fieldName} field · Dibrugarh district, Assam</div>
          <div className="mt-0.5 text-[13px] text-ink-muted">Fictional wells on real terrain</div>
          <div className="mt-2.5 text-[15px] text-ink-bright" style={{ opacity: insideK }} data-arrival-inside>
            <span className="num font-semibold">{insideCount}</span> offset wells within <span className="font-semibold">5 km</span>
          </div>
        </div>
      )}
      {overlay && counterK > 0 && (
        <div
          className="absolute top-8 right-9 w-[300px] rounded-[6px] bg-[#020617]/82 px-5 py-4 backdrop-blur-sm"
          style={{ opacity: counterK }}
          data-arrival-counter
        >
          <div className="label-caps text-[11px] text-ink-muted">Reading the offset reports</div>
          {(
            [
              [wellsRead, "offset wells"],
              [reportsRead, "daily reports read"],
              [incidents, "incidents found"],
            ] as const
          ).map(([n, label]) => (
            <div key={label} className="mt-2.5 flex items-baseline gap-3">
              <span className="num w-[92px] text-right text-[30px] leading-none font-semibold text-ink-bright">{n.toLocaleString("en-US")}</span>
              <span className="text-[15px] text-ink">{label}</span>
            </div>
          ))}
          <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {kinds.map((kind) => (
              <li key={kind} className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[kind] }} />
                {KIND_LABEL[kind]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {t >= T.alignStart + 0.8 && t < T.tiltEnd + 1 && (
        <div
          className="absolute top-8 left-1/2 -translate-x-1/2 rounded-[6px] bg-[#020617]/82 px-5 py-3 text-center"
          style={{ opacity: seg(t, T.alignStart + 0.8, T.alignStart + 1.4) * (1 - seg(t, T.tiltEnd, T.tiltEnd + 1)) }}
          data-arrival-line
        >
          <div className="text-[18px] font-semibold text-ink-bright">Section A–A′</div>
          <div className="text-[13.5px] text-ink-muted">Five wells, west to east, cut open to the rock they drilled</div>
        </div>
      )}
      {hasKey && t >= T.snapEnd && groundFade > 0 && (
        <div className="absolute bottom-3 left-4 text-[11px] text-white/70" style={{ opacity: groundFade }}>
          Google · imagery © Google
        </div>
      )}
      {!film && (
        <button
          type="button"
          onClick={finish}
          className="absolute right-6 bottom-6 rounded-[4px] border border-white/25 bg-[#020617]/70 px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
        >
          Skip to the section · Esc
        </button>
      )}
    </div>
  );
}
