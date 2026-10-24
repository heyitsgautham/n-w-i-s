import type { Lithology } from "@wells/correlate";
import type { DisplayBed } from "@/lib/hero-model";
import type { DisplayInterval, SectionLayout, Track, WellLayout } from "./layout";
import { lithFill, lithPattern } from "./patterns";
import { Plate } from "./plate";

const GR_MAX = 150;
export const ROP_MAX = 40;

const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

function TrackFrame({ L, t }: { L: SectionLayout; t: Track }) {
  return (
    <rect
      x={t.x0}
      y={L.drawTop}
      width={t.x1 - t.x0}
      height={L.drawBottom - L.drawTop}
      style={{ fill: "var(--paper-deep)", stroke: "var(--rule-strong)" }}
      strokeWidth={1}
    />
  );
}

/** A log curve drawn as a line with a faint fill back to the track's zero edge. */
function Curve({ L, t, pts, max, ink }: { L: SectionLayout; t: Track; pts: { d: number; v: number }[]; max: number; ink: string }) {
  if (pts.length < 2) return null;
  const w = t.x1 - t.x0 - 2;
  const xy = pts.map((p) => `${(t.x0 + 1 + Math.min(1, Math.max(0, p.v / max)) * w).toFixed(1)},${L.y(p.d).toFixed(1)}`);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const area = `M${t.x0 + 1},${L.y(first.d).toFixed(1)} L${xy.join(" L")} L${t.x0 + 1},${L.y(last.d).toFixed(1)} Z`;
  return (
    <g>
      <path d={area} style={{ fill: ink }} opacity={0.1} />
      <polyline points={xy.join(" ")} style={{ fill: "none", stroke: ink }} strokeWidth={1} opacity={0.85} strokeLinejoin="round" />
    </g>
  );
}

function LithRects({
  t,
  L,
  intervals,
  lithOf,
  fillOpacity,
  withPattern,
}: {
  t: Track;
  L: SectionLayout;
  intervals: DisplayInterval[];
  lithOf: (id: string) => Lithology;
  fillOpacity: number;
  withPattern: boolean;
}) {
  return (
    <g>
      {intervals.map((iv) => {
        const y0 = Math.max(L.drawTop - 4, L.y(iv.top));
        const y1 = Math.min(L.drawBottom + 4, L.y(iv.base));
        if (y1 <= y0) return null;
        const lith = lithOf(iv.formationId);
        const pattern = lithPattern(lith);
        return (
          <g key={iv.formationId}>
            <rect x={t.x0} y={y0} width={t.x1 - t.x0} height={y1 - y0} style={{ fill: lithFill(lith) }} opacity={fillOpacity} />
            {withPattern && pattern && <rect x={t.x0} y={y0} width={t.x1 - t.x0} height={y1 - y0} fill={pattern} />}
          </g>
        );
      })}
    </g>
  );
}

function Beds({ t, L, beds, maxD }: { t: Track; L: SectionLayout; beds: DisplayBed[]; maxD?: number }) {
  return (
    <g>
      {beds.map((b) => {
        const base = maxD === undefined ? b.dBase : Math.min(b.dBase, maxD);
        if (base <= b.dTop) return null;
        const y0 = L.y(b.dTop);
        const h = Math.max(1.2, L.y(base) - y0);
        const pattern = lithPattern(b.lithology);
        return (
          <g key={`${b.mdTop}`}>
            <rect x={t.x0} y={y0} width={t.x1 - t.x0} height={h} style={{ fill: lithFill(b.lithology) }} opacity={b.lithology === "coal" ? 1 : 0.85} />
            {pattern && <rect x={t.x0} y={y0} width={t.x1 - t.x0} height={h} fill={pattern} />}
          </g>
        );
      })}
    </g>
  );
}

function TopTicks({ L, t, intervals }: { L: SectionLayout; t: Track; intervals: DisplayInterval[] }) {
  return (
    <g>
      {intervals.map((iv) => (
        <line
          key={iv.formationId}
          x1={t.x0}
          x2={t.x1}
          y1={L.y(iv.top)}
          y2={L.y(iv.top)}
          style={{ stroke: "var(--ink-bright)" }}
          strokeWidth={1.2}
          opacity={0.85}
        />
      ))}
    </g>
  );
}

export function OffsetTracks({
  L,
  w,
  intervals,
  lithOf,
}: {
  L: SectionLayout;
  w: WellLayout;
  intervals: DisplayInterval[];
  lithOf: (id: string) => Lithology;
}) {
  const inWindow = intervals.filter((iv) => iv.top >= L.windowTop && iv.top <= L.windowBottom);
  const labelX = w.side < 0 ? w.gr.x1 - 4 : w.gr.x0 + 4;
  return (
    <g>
      <TrackFrame L={L} t={w.gr} />
      <Curve L={L} t={w.gr} pts={w.well.gamma} max={GR_MAX} ink="var(--ink)" />
      <LithRects t={w.lith} L={L} intervals={intervals} lithOf={lithOf} fillOpacity={0.82} withPattern />
      <Beds t={w.lith} L={L} beds={w.well.beds} />
      <rect x={w.lith.x0} y={L.drawTop} width={w.lith.x1 - w.lith.x0} height={L.drawBottom - L.drawTop} fill="none" style={{ stroke: "var(--rule-strong)" }} />
      <TopTicks L={L} t={w.lith} intervals={inWindow} />
      {inWindow.map((iv) => {
        const top = w.well.tops.find((t) => t.formationId === iv.formationId)!;
        return (
          <Plate key={iv.formationId} x={labelX} y={L.y(iv.top) + 12} label={fmt(top.md)} fill="var(--paper-deep)" pad={2}>
            <text x={labelX} y={L.y(iv.top) + 12} textAnchor={w.side < 0 ? "end" : "start"} className="num" fontSize={10.5} style={{ fill: "var(--ink)" }}>
              {fmt(top.md)}
            </text>
          </Plate>
        );
      })}
    </g>
  );
}

export interface ActiveTrackState {
  intervals: DisplayInterval[];
  bitD: number;
  samplesD: number;
  gammaLimitD: number;
  rop: { d: number; v: number }[];
}

export function ActiveTracks({ L, w, state, lithOf }: { L: SectionLayout; w: WellLayout; state: ActiveTrackState; lithOf: (id: string) => Lithology }) {
  const t = w.lith;
  const width = t.x1 - t.x0;
  const ySamples = L.y(state.samplesD);
  const yBit = L.y(state.bitD);
  const zone = (id: string, y0: number, y1: number) => (
    <clipPath id={id}>
      <rect x={t.x0} y={y0} width={width} height={Math.max(0, y1 - y0)} />
    </clipPath>
  );
  const gamma = w.well.gamma.filter((s) => s.d <= state.gammaLimitD);
  return (
    <g>
      <defs>
        {zone("active-described", L.drawTop - 4, ySamples)}
        {zone("active-transit", ySamples, yBit)}
        {zone("active-ahead", yBit, L.drawBottom + 4)}
      </defs>
      {/* A faint column behind the active well so the eye finds it first. */}
      <rect x={w.gr.x0 - 6} y={L.drawTop} width={w.rop!.x1 - w.gr.x0 + 12} height={L.drawBottom - L.drawTop} style={{ fill: "var(--ink)" }} opacity={0.035} />
      <TrackFrame L={L} t={w.gr} />
      <Curve L={L} t={w.gr} pts={gamma} max={GR_MAX} ink="var(--ink)" />
      <TrackFrame L={L} t={w.rop!} />
      <Curve L={L} t={w.rop!} pts={state.rop} max={ROP_MAX} ink="#7dd3c0" />

      <rect x={t.x0} y={L.drawTop} width={width} height={L.drawBottom - L.drawTop} style={{ fill: "var(--paper-deep)" }} />
      <g clipPath="url(#active-described)">
        <LithRects t={t} L={L} intervals={state.intervals} lithOf={lithOf} fillOpacity={0.85} withPattern />
        <Beds t={t} L={L} beds={w.well.beds} maxD={state.samplesD} />
      </g>
      <g clipPath="url(#active-transit)">
        <LithRects t={t} L={L} intervals={state.intervals} lithOf={lithOf} fillOpacity={0.55} withPattern={false} />
        <rect x={t.x0} y={ySamples} width={width} height={Math.max(0, yBit - ySamples)} fill="url(#pat-transit)" />
      </g>
      <g clipPath="url(#active-ahead)">
        <LithRects t={t} L={L} intervals={state.intervals} lithOf={lithOf} fillOpacity={0.62} withPattern={false} />
        <rect x={t.x0} y={yBit} width={width} height={Math.max(0, L.drawBottom - yBit)} fill="url(#pat-prognosis)" opacity={0.55} />
      </g>
      <rect x={t.x0} y={L.drawTop} width={width} height={L.drawBottom - L.drawTop} fill="none" style={{ stroke: "var(--ink-muted)" }} strokeWidth={1} />
    </g>
  );
}

/** The bit: a filled wedge at the bottom of the drilled hole, and a hairline across the section. */
export function BitMarker({ L, w, bitD, bitMd }: { L: SectionLayout; w: WellLayout; bitD: number; bitMd: number }) {
  const y = L.y(bitD);
  const t = w.lith;
  const mid = (t.x0 + t.x1) / 2;
  const lane = w.lane!;
  return (
    <g>
      <line x1={L.ruler.x1} x2={L.width - 4} y1={y} y2={y} style={{ stroke: "var(--ink-bright)" }} strokeWidth={0.8} strokeDasharray="1.5 4" opacity={0.45} />
      {/* Tip on the bit depth, narrow enough that the samples-in-transit band shows either side. */}
      <path d={`M${mid - 9} ${y - 8} H${mid + 9} L${mid} ${y} Z`} style={{ fill: "var(--ink-bright)", stroke: "var(--paper)" }} strokeWidth={1} />
      <rect x={lane.x0 + 5} y={y - 9} width={112} height={18} rx={2} style={{ fill: "var(--paper)" }} opacity={0.92} />
      <text
        x={lane.x0 + 10}
        y={y + 4}
        className="num"
        fontSize={12.5}
        fontWeight={600}
        style={{ fill: "var(--ink-bright)", stroke: "var(--paper)", strokeWidth: 4, paintOrder: "stroke" }}
      >
        {`BIT ${bitMd.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`}
      </text>
    </g>
  );
}
