"use client";

import { useEffect, useRef, useState } from "react";
import { offsetLatLng, type LatLng } from "@/lib/geo";
import { importLibrary } from "@/lib/google-maps";
import type { MapModel } from "./map-screen";

interface GMap {
  fitBounds: (b: { north: number; south: number; east: number; west: number }, padding?: number) => void;
  getProjection: () => { fromLatLngToPoint: (ll: LatLng) => { x: number; y: number } } | undefined;
  getCenter: () => { lat: () => number; lng: () => number } | undefined;
  getZoom: () => number | undefined;
  addListener: (event: string, fn: () => void) => { remove: () => void };
}

type Projector = (x: number, y: number) => { x: number; y: number };

/**
 * The offsets on Google satellite imagery. The wells are fictional and placed around the field's
 * anchor; the terrain under them is real. The map pans and zooms; everything drawn over it is
 * projected from field metres on every move, so it stays on the ground.
 */
export function SatelliteMap({
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
  const box = useRef<HTMLDivElement>(null);
  const [project, setProject] = useState<Projector | null>(null);
  const [failed, setFailed] = useState(false);
  const anchor = model.anchor;

  useEffect(() => {
    let live = true;
    const listeners: { remove: () => void }[] = [];
    importLibrary<{ Map: new (el: HTMLElement, o: object) => GMap }>("maps")
      .then(({ Map }) => {
        if (!live || !box.current) return;
        const map = new Map(box.current, {
          mapTypeId: "satellite",
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          isFractionalZoomEnabled: true,
          keyboardShortcuts: false,
          clickableIcons: false,
          tilt: 0,
          backgroundColor: "#050b18",
        });
        // Frame every well with room for labels.
        const xs = model.wells.map((w) => w.x);
        const ys = model.wells.map((w) => w.y);
        const sw = offsetLatLng(anchor, Math.min(...xs) - 800, Math.min(...ys) - 800);
        const ne = offsetLatLng(anchor, Math.max(...xs) + 800, Math.max(...ys) + 800);
        map.fitBounds({ north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng }, 24);
        const update = () => {
          const proj = map.getProjection();
          const c = map.getCenter();
          const z = map.getZoom();
          const el = box.current;
          if (!proj || !c || z === undefined || !el) return;
          const scale = 2 ** z;
          const centre = proj.fromLatLngToPoint({ lat: c.lat(), lng: c.lng() });
          const W = el.clientWidth;
          const H = el.clientHeight;
          setProject(() => (x: number, y: number) => {
            const p = proj.fromLatLngToPoint(offsetLatLng(anchor, x, y));
            return { x: (p.x - centre.x) * scale + W / 2, y: (p.y - centre.y) * scale + H / 2 };
          });
        };
        listeners.push(map.addListener("bounds_changed", update), map.addListener("idle", update));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      for (const l of listeners) l.remove();
    };
  }, [anchor, model.wells]);

  if (failed) {
    return <p className="absolute inset-0 grid place-items-center text-[14px] text-ink-muted">The satellite map did not load. Switch to Structure.</p>;
  }

  const P = project;
  const active = model.wells.find((w) => w.id === model.activeWellId)!;
  const section = model.sectionOrder.map((id) => model.wells.find((w) => w.id === id)!);
  const ringR = P ? Math.hypot(P(radiusKm * 1000, 0).x - P(0, 0).x, P(radiusKm * 1000, 0).y - P(0, 0).y) : 0;
  const halo = { stroke: "#020617", strokeWidth: 3.5, paintOrder: "stroke" as const };

  return (
    <div className="absolute inset-0" data-satellite-map>
      <div ref={box} className="absolute inset-0" />
      {P && (
        <svg width={width} height={height} className="pointer-events-none absolute inset-0" role="img" aria-label="Offsets on satellite imagery">
          {/* Fault F1, a north-south trace in field coordinates. */}
          {model.faults.map((f) => {
            const a = P(f.x, -8000);
            const b = P(f.x, 8000);
            const t = P(f.x, 6200);
            return (
              <g key={f.name}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f0874f" strokeWidth={2} strokeDasharray="10 6" opacity={0.85} />
                <text x={t.x + 8} y={t.y} fontSize={13} fontWeight={600} fill="#f8b48c" style={halo}>
                  {`${f.name} · ${f.throwM} m down to E`}
                </text>
              </g>
            );
          })}
          {/* Section line A–A′ */}
          <polyline points={section.map((w) => `${P(w.x, w.y).x},${P(w.x, w.y).y}`).join(" ")} fill="none" stroke="#f8fafc" strokeWidth={1.6} strokeDasharray="8 4 2 4" opacity={0.8} />
          {/* Radius ring */}
          <circle cx={P(active.x, active.y).x} cy={P(active.x, active.y).y} r={ringR} fill="#f8fafc" fillOpacity={0.05} stroke="#f8fafc" strokeWidth={1.8} strokeDasharray="7 5" data-ring={radiusKm} />
          <text x={P(active.x, active.y).x} y={P(active.x, active.y).y - ringR - 10} textAnchor="middle" fontSize={14} fontWeight={600} fill="#f8fafc" style={halo}>
            {`${radiusKm.toFixed(1)} km`}
          </text>
          {model.wells
            .filter((w) => w.role === "offset")
            .map((w) => {
              const p = P(w.x, w.y);
              const inside = inRing.has(w.id);
              const hot = w.id === highlight;
              const isBest = w.id === best;
              return (
                <g key={w.id} className="pointer-events-auto" onMouseEnter={() => onHover(w.id)} onMouseLeave={() => onHover(null)} data-well={w.id}>
                  {(hot || isBest) && <circle cx={p.x} cy={p.y} r={15} fill="none" stroke={isBest ? "var(--watch)" : "#f8fafc"} strokeWidth={2} />}
                  <circle cx={p.x} cy={p.y} r={hot || isBest ? 7 : inside ? 6 : 4.5} fill={inside ? "#fbbf24" : "#cbd5e1"} stroke="#020617" strokeWidth={1.6} opacity={inside ? 1 : 0.75} />
                  <text x={p.x + 10} y={p.y - 8} fontSize={inside ? 14 : 12} fontWeight={inside ? 600 : 400} fill={inside ? "#f8fafc" : "#cbd5e1"} style={halo}>
                    {w.id}
                  </text>
                </g>
              );
            })}
          <g>
            <circle cx={P(active.x, active.y).x} cy={P(active.x, active.y).y} r={15} fill="#ef4444" opacity={0.25} />
            <circle cx={P(active.x, active.y).x} cy={P(active.x, active.y).y} r={8} fill="#ef4444" stroke="#f8fafc" strokeWidth={2.4} />
            <text x={P(active.x, active.y).x + 16} y={P(active.x, active.y).y + 22} fontSize={16} fontWeight={700} fill="#f8fafc" style={halo}>
              {model.activeWellId}
            </text>
          </g>
        </svg>
      )}
      <div className="pointer-events-none absolute top-3 left-3 rounded-[4px] bg-[#020617]/80 px-3 py-2 text-[12px] text-ink-muted">
        Real terrain, Dibrugarh district · wells and field fictional
      </div>
    </div>
  );
}
