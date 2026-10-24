import type { HeroModel } from "@/lib/hero-model";
import type { SectionLayout, Track, WellLayout } from "./layout";
import { ROP_MAX } from "./well-tracks";

const GR_SCALE = [0, 150];

/** Depth ruler and the faint 10 m graph-paper grid behind the section. */
export function DepthGrid({ L }: { L: SectionLayout }) {
  const lines: React.ReactNode[] = [];
  for (let d = Math.ceil(L.windowTop / 10) * 10; d <= L.windowBottom; d += 10) {
    const y = L.y(d);
    const major = d % 50 === 0;
    lines.push(
      <g key={d}>
        <line
          x1={L.ruler.x1}
          x2={L.width - 4}
          y1={y}
          y2={y}
          style={{ stroke: major ? "var(--rule-strong)" : "var(--rule)" }}
          strokeWidth={1}
          opacity={major ? 0.9 : 0.55}
        />
        <line x1={L.ruler.x1 - (major ? 9 : 4)} x2={L.ruler.x1} y1={y} y2={y} style={{ stroke: "var(--ink-dim)" }} strokeWidth={1} />
        {major && (
          <text x={L.ruler.x1 - 12} y={y + 3.8} textAnchor="end" className="num" fontSize={11} style={{ fill: "var(--ink-muted)" }}>
            {d.toLocaleString("en-US")}
          </text>
        )}
      </g>,
    );
  }
  return (
    <g>
      {lines}
      <line x1={L.ruler.x1} x2={L.ruler.x1} y1={L.drawTop} y2={L.drawBottom} style={{ stroke: "var(--ink-dim)" }} strokeWidth={1} />
    </g>
  );
}

function TrackHead({ t, label, scale, y }: { t: Track; label: string; scale?: [number, number]; y: number }) {
  const mid = (t.x0 + t.x1) / 2;
  return (
    <g>
      <text x={mid} y={y} textAnchor="middle" fontSize={9.5} className="label-caps" style={{ fill: "var(--ink-dim)" }}>
        {label}
      </text>
      {scale && (
        <g className="num" fontSize={9} style={{ fill: "var(--ink-faint)" }}>
          <text x={t.x0 + 1} y={y + 12}>
            {scale[0]}
          </text>
          <text x={t.x1 - 1} y={y + 12} textAnchor="end">
            {scale[1]}
          </text>
        </g>
      )}
    </g>
  );
}

/** Well headers, section ends and track captions above the drawing. */
export function SectionHeaders({ L, model }: { L: SectionLayout; model: HeroModel }) {
  const trackY = L.drawTop - 22;
  return (
    <g>
      <SectionEnd x={L.ruler.x1 / 2 + 2} label="A" />
      <SectionEnd x={L.width - 16} label="A′" />
      <text x={L.ruler.x1 / 2 + 2} y={trackY} textAnchor="middle" fontSize={9.5} className="label-caps" style={{ fill: "var(--ink-dim)" }}>
        TVD
      </text>
      <text x={L.ruler.x1 / 2 + 2} y={trackY + 12} textAnchor="middle" className="num" fontSize={9} style={{ fill: "var(--ink-faint)" }}>
        m
      </text>
      {L.wells.map((w) => (
        <WellHeader key={w.well.id} w={w} trackY={trackY} model={model} />
      ))}
      <line x1={0} x2={L.width} y1={L.drawTop - 1} y2={L.drawTop - 1} style={{ stroke: "var(--rule-strong)" }} />
    </g>
  );
}

function SectionEnd({ x, label }: { x: number; label: string }) {
  return (
    <g>
      <circle cx={x} cy={20} r={11} style={{ fill: "none", stroke: "var(--ink-dim)" }} />
      <text x={x} y={24.5} textAnchor="middle" fontSize={13} fontWeight={600} style={{ fill: "var(--ink-muted)" }}>
        {label}
      </text>
    </g>
  );
}

function WellHeader({ w, trackY, model }: { w: WellLayout; trackY: number; model: HeroModel }) {
  const well = w.well;
  if (w.active) {
    const x0 = w.gr.x0 - 6;
    const x1 = w.lane!.x1 - 8;
    const cx = (w.gr.x0 + w.rop!.x1) / 2;
    return (
      <g>
        <rect x={x0} y={2} width={x1 - x0} height={trackY - 16} rx={2} style={{ fill: "var(--ink)" }} opacity={0.05} />
        <rect x={x0} y={2} width={x1 - x0} height={2} style={{ fill: "var(--ink-bright)" }} />
        <text x={cx} y={27} textAnchor="middle" fontSize={21} fontWeight={700} style={{ fill: "var(--ink-bright)" }} data-well-head={well.id}>
          {well.id}
        </text>
        <text x={w.lane!.x0 + 8} y={22} fontSize={10.5} className="label-caps" style={{ fill: "var(--ink-bright)" }}>
          Active
        </text>
        <text x={w.lane!.x0 + 8} y={36} fontSize={11} style={{ fill: "var(--ink-muted)" }}>
          {`Drilling ${model.replay.holeSizeIn} in · ${well.rig}`}
        </text>
        <text x={cx} y={48} textAnchor="middle" className="num" fontSize={10} style={{ fill: "var(--ink-dim)" }}>
          {`RT ${well.rtElevation} m · spud ${well.spudYear}`}
        </text>
        <TrackHead t={w.gr} label="GR LWD" scale={GR_SCALE as [number, number]} y={trackY} />
        <TrackHead t={w.lith} label="Lith" y={trackY} />
        <TrackHead t={w.rop!} label="ROP" scale={[0, ROP_MAX]} y={trackY} />
        <text x={w.lane!.x0 + 8} y={trackY} fontSize={9.5} className="label-caps" style={{ fill: "var(--ink-dim)" }}>
          Time to hazard
        </text>
      </g>
    );
  }
  return (
    <g>
      <text x={w.center} y={25} textAnchor="middle" fontSize={17} fontWeight={600} style={{ fill: "var(--ink)" }} data-well-head={well.id}>
        {well.id}
      </text>
      <text x={w.center} y={40} textAnchor="middle" fontSize={11.5} style={{ fill: "var(--ink-muted)" }}>
        {`${well.distanceKm} km ${well.bearing} · ${well.spudYear}`}
      </text>
      <text x={w.center} y={53} textAnchor="middle" className="num" fontSize={10} style={{ fill: "var(--ink-dim)" }}>
        {`RT ${well.rtElevation} m`}
      </text>
      <TrackHead t={w.gr} label="GR" scale={GR_SCALE as [number, number]} y={trackY} />
      <TrackHead t={w.lith} label="Lith" y={trackY} />
    </g>
  );
}
