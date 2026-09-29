import { formatHours, type Band, type Formation, type FormationTop, type OffsetEvent } from "@wells/correlate";
import type { NumberedAlert, Scene } from "@/lib/scene";
import { clock } from "@/lib/format";
import type { DisplayInterval, SectionLayout, WellLayout } from "./layout";
import { Plate } from "./plate";

export const BAND_COLOR: Record<Band, string> = {
  prepare: "var(--prepare)",
  watch: "var(--watch)",
  monitor: "var(--monitor)",
  passed: "var(--passed)",
};

const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
const halo = (fill: string) => ({ fill, stroke: "var(--paper)", strokeWidth: 3.5, paintOrder: "stroke" as const });

interface Ctx {
  L: SectionLayout;
  wells: WellLayout[];
  active: WellLayout;
  intervals: Map<string, DisplayInterval[]>;
  /** Section display depth for an MD in a given well. */
  display: (wellId: string, md: number) => number;
}

/** Where a formation-relative position falls in a well, in display depth. */
function relativeDepth(ctx: Ctx, wellId: string, a: NumberedAlert) {
  const iv = ctx.intervals.get(wellId)?.find((x) => x.formationId === a.projection.formationId);
  if (!iv) return undefined;
  return a.projection.anchor === "top" ? iv.top + a.projection.offsetM : iv.base - a.projection.offsetM;
}

function Badge({ x, y, n, band, r = 8.5 }: { x: number; y: number; n: number; band: Band; r?: number }) {
  const solid = band === "prepare" || band === "watch";
  return (
    <g>
      <circle cx={x} cy={y} r={r} style={{ fill: solid ? BAND_COLOR[band] : "var(--paper)", stroke: BAND_COLOR[band] }} strokeWidth={1.5} />
      <text x={x} y={y + 3.8} textAnchor="middle" className="num" fontSize={11} fontWeight={600} style={{ fill: solid ? "#0b0f19" : BAND_COLOR[band] }}>
        {n}
      </text>
    </g>
  );
}

/**
 * Projection lines run from each offset event to its place on the active well, following the
 * event's position inside its formation through every well in between.
 */
export function ProjectionLines({ ctx, alerts }: { ctx: Ctx; alerts: NumberedAlert[] }) {
  const ai = ctx.wells.indexOf(ctx.active);
  return (
    <g fill="none">
      {alerts.map((a) => {
        const oi = ctx.wells.findIndex((w) => w.well.id === a.event.wellId);
        if (oi < 0) return null;
        const dir = oi < ai ? 1 : -1;
        const pts: [number, number][] = [];
        for (let k = oi; k !== ai; k += dir) {
          const from = ctx.wells[k]!;
          const to = ctx.wells[k + dir]!;
          const dFrom = k === oi ? ctx.display(from.well.id, a.event.md) : relativeDepth(ctx, from.well.id, a);
          const dTo = k + dir === ai ? ctx.display(to.well.id, a.projection.md) : relativeDepth(ctx, to.well.id, a);
          if (dFrom === undefined || dTo === undefined) continue;
          const xFrom = (dir > 0 ? from.lith.x1 : from.lith.x0) + (k === oi ? dir * 14 : 0);
          const xTo = dir > 0 ? to.left : to.right;
          pts.push([xFrom, ctx.L.y(dFrom)], [xTo, ctx.L.y(dTo)]);
        }
        const segs = [];
        for (let i = 0; i < pts.length; i += 2) {
          const [p, q] = [pts[i]!, pts[i + 1]!];
          segs.push(<line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />);
        }
        return (
          <g key={a.event.id} style={{ stroke: BAND_COLOR[a.band] }} strokeWidth={1.3} strokeDasharray="2 3" opacity={0.85}>
            {segs}
          </g>
        );
      })}
    </g>
  );
}

/** Event pins where each event happened in its offset, numbered like the alert list. */
export function OffsetPins({
  ctx,
  alerts,
  passed,
  onOpen,
}: {
  ctx: Ctx;
  alerts: NumberedAlert[];
  passed: Scene["passed"];
  onOpen: (e: OffsetEvent) => void;
}) {
  const ai = ctx.wells.indexOf(ctx.active);
  return (
    <g>
      {passed.map((p) => {
        const w = ctx.wells.find((x) => x.well.id === p.event.wellId);
        if (!w) return null;
        const d = ctx.display(w.well.id, p.event.md);
        if (d < ctx.L.windowTop || d > ctx.L.windowBottom) return null;
        const dir = ctx.wells.indexOf(w) < ai ? 1 : -1;
        const x = dir > 0 ? w.lith.x1 : w.lith.x0;
        const y = ctx.L.y(d);
        return (
          <g key={p.event.id} onClick={() => onOpen(p.event)} style={{ cursor: "pointer" }}>
            <path d={`M${x} ${y} l${dir * 8} -4.5 v9 Z`} style={{ fill: "var(--passed)" }} />
            <title>{`${p.event.title}, ${p.event.wellId} ${fmt(p.event.md)} m. Behind the bit.`}</title>
          </g>
        );
      })}
      {alerts.map((a) => {
        const w = ctx.wells.find((x) => x.well.id === a.event.wellId);
        if (!w) return null;
        const dir = ctx.wells.indexOf(w) < ai ? 1 : -1;
        const edge = dir > 0 ? w.lith.x1 : w.lith.x0;
        const y = ctx.L.y(ctx.display(w.well.id, a.event.md));
        return (
          <g key={a.event.id} onClick={() => onOpen(a.event)} style={{ cursor: "pointer" }} data-pin={`offset-${a.n}`} data-event={a.event.id}>
            <line x1={edge - dir * 6} x2={edge + dir * 6} y1={y} y2={y} style={{ stroke: BAND_COLOR[a.band] }} strokeWidth={2} />
            <Badge x={edge + dir * 14} y={y} n={a.n} band={a.band} />
            <title>{`${a.event.title}, ${a.event.wellId} ${fmt(a.event.md)} m`}</title>
          </g>
        );
      })}
    </g>
  );
}

/** Projected hazards on the active well, with their time to hazard in the lane. */
export function ActivePins({ ctx, alerts, onOpen }: { ctx: Ctx; alerts: NumberedAlert[]; onOpen: (e: OffsetEvent) => void }) {
  const w = ctx.active;
  const lane = w.lane!;
  return (
    <g>
      {alerts.map((a) => {
        const y = ctx.L.y(ctx.display(w.well.id, a.projection.md));
        const color = BAND_COLOR[a.band];
        return (
          <g key={a.event.id} onClick={() => onOpen(a.event)} style={{ cursor: "pointer" }} data-pin={`active-${a.n}`}>
            <line x1={w.gr.x0} x2={w.rop!.x1} y1={y} y2={y} style={{ stroke: color }} strokeWidth={2.2} />
            <path d={`M${w.rop!.x1} ${y} l6 -4 v8 Z`} style={{ fill: color }} />
            <rect x={lane.x0 + 32} y={y - 13} width={112} height={32} rx={2} style={{ fill: "var(--paper)" }} opacity={0.88} />
            <Badge x={lane.x0 + 20} y={y} n={a.n} band={a.band} r={9.5} />
            <text x={lane.x0 + 36} y={y + 1} className="num" fontSize={14} fontWeight={600} style={halo(color)}>
              {a.hours === null ? "passed" : formatHours(a.hours)}
            </text>
            <text x={lane.x0 + 36} y={y + 15} className="num" fontSize={10.5} style={halo("var(--ink-muted)")}>
              {`${fmt(a.projection.md)} m · ${a.event.wellId}`}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** A stacked, right-aligned label that fits the narrowest gap: formation, status, depth. */
function TopLabel({
  x,
  y,
  name,
  status,
  depth,
  bright,
}: {
  x: number;
  y: number;
  name: string;
  status: string;
  depth: string;
  bright?: boolean;
}) {
  return (
    <Plate x={x} y={y} label={`${name}|${status}|${depth}|${bright ? 1 : 0}`}>
      <text x={x} y={y - 30} textAnchor="end" fontSize={10} className="label-caps" style={halo(bright ? "var(--ink-bright)" : "var(--ink-muted)")}>
        {name}
      </text>
      <text x={x} y={y - 18} textAnchor="end" fontSize={11} style={halo(bright ? "var(--ink-bright)" : "var(--ink-muted)")}>
        {status}
      </text>
      <text x={x} y={y - 5} textAnchor="end" className="num" fontSize={bright ? 14 : 12.5} fontWeight={bright ? 600 : 400} style={halo(bright ? "var(--ink-bright)" : "var(--ink)")}>
        {depth}
      </text>
    </Plate>
  );
}

/** Top lines on the active well, the call, the ghost of the prognosis and the dimension between them. */
export function ActiveTops({ ctx, scene, formations }: { ctx: Ctx; scene: Scene; formations: Formation[] }) {
  const w = ctx.active;
  const id = w.well.id;
  const x0 = w.gr.x0;
  const x1 = w.rop!.x1;
  const labelX = w.left - 10;
  const call = scene.call;
  const calledId = call?.message.topCall?.formationId;
  const nameOf = (fid: string) => formations.find((f) => f.id === fid)?.short ?? fid;
  const dy = (md: number) => ctx.L.y(ctx.display(id, md));
  const inWindow = (t: FormationTop) => {
    const d = ctx.display(id, t.md);
    return d >= ctx.L.windowTop && d <= ctx.L.windowBottom;
  };

  const out: React.ReactNode[] = [];
  for (const t of scene.tops.filter(inWindow)) {
    const y = dy(t.md);
    const called = t.status === "called";
    out.push(
      <line
        key={`line-${t.formationId}`}
        x1={x0}
        x2={x1}
        y1={y}
        y2={y}
        style={{ stroke: called ? "var(--ink-bright)" : "var(--ink)" }}
        strokeWidth={called ? 1.8 : 1.3}
        strokeDasharray={called ? undefined : "5 3"}
      />,
    );
    if (t.formationId === calledId) continue;
    const moved = call !== null && scene.prognosis.find((p) => p.formationId === t.formationId)!.md !== t.md;
    out.push(
      <TopLabel key={`label-${t.formationId}`} x={labelX} y={y} name={nameOf(t.formationId)} status={moved ? "re-hung" : "prognosed"} depth={`${fmt(t.md)} m`} />,
    );
  }

  const prog = calledId ? scene.prognosis.find((t) => t.formationId === calledId) : undefined;
  const current = calledId ? scene.tops.find((t) => t.formationId === calledId) : undefined;
  if (call && calledId && prog && current) {
    const yProg = dy(prog.md);
    const yCall = dy(call.message.topCall!.md);
    const yNow = dy(current.md);
    const shift = current.md - prog.md;
    const e = call.elapsedMs;
    const pulse = e !== null && e < 1400 ? (e % 700) / 700 : null;
    out.push(
      <g key="call">
        {pulse !== null && (
          <circle
            cx={(w.lith.x0 + w.lith.x1) / 2}
            cy={yCall}
            r={8 + 34 * pulse}
            style={{ fill: "none", stroke: "var(--ink-bright)" }}
            strokeWidth={1.6}
            opacity={(1 - pulse) * 0.9}
          />
        )}
        {current.status !== "called" && (
          <line x1={x0 - 4} x2={x1 + 4} y1={yCall} y2={yCall} style={{ stroke: "var(--ink-bright)" }} strokeWidth={1.8} />
        )}
        <line x1={x0} x2={x1} y1={yProg} y2={yProg} style={{ stroke: "var(--ink-dim)" }} strokeWidth={1} strokeDasharray="3 3" />
        <TopLabel
          x={labelX}
          y={yCall}
          name={nameOf(calledId)}
          status={`called ${clock(call.message.time).slice(0, 5)}`}
          depth={`${fmt(call.message.topCall!.md)} m`}
          bright
        />
        <Plate x={labelX} y={yProg + 14} label={`prog. ${fmt(prog.md)} m`}>
          <text x={labelX} y={yProg + 14} textAnchor="end" className="num" fontSize={11} style={halo("var(--ink-muted)")}>
            {`prog. ${fmt(prog.md)} m`}
          </text>
        </Plate>
        {Math.abs(shift) >= 2 && (
          <g>
            <line
              x1={w.left - 4}
              x2={w.left - 4}
              y1={yProg - 1}
              y2={yNow + 1}
              style={{ stroke: "var(--ink)" }}
              strokeWidth={1.1}
              markerStart="url(#dim-arrow)"
              markerEnd="url(#dim-arrow)"
            />
            <Plate x={labelX} y={(yProg + yNow) / 2 + 4.5} label={`${shift < 0 ? "−" : "+"}${fmt(Math.abs(shift))} m`}>
              <text x={labelX} y={(yProg + yNow) / 2 + 4.5} textAnchor="end" className="num" fontSize={13} fontWeight={600} style={halo("var(--ink-bright)")}>
                {`${shift < 0 ? "−" : "+"}${fmt(Math.abs(shift))} m`}
              </text>
            </Plate>
          </g>
        )}
      </g>,
    );
  }
  return <g>{out}</g>;
}

/**
 * The mud-log call as it lands, pinned to the active well at the called depth. It carries the
 * moment on camera and clears once the section has re-tied; the feed and the top label keep the record.
 */
export function CallCallout({ ctx, scene, fadeOutAt, endAt }: { ctx: Ctx; scene: Scene; fadeOutAt: number; endAt: number }) {
  const call = scene.call;
  if (!call || call.elapsedMs === null || call.elapsedMs >= endAt) return null;
  const e = call.elapsedMs;
  const opacity = e < 160 ? e / 160 : e > fadeOutAt ? Math.max(0, 1 - (e - fadeOutAt) / (endAt - fadeOutAt)) : 1;
  const rise = e < 220 ? (1 - e / 220) * 8 : 0;
  const w = ctx.active;
  const yCall = ctx.L.y(ctx.display(w.well.id, call.message.topCall!.md));
  const x = w.lane!.x0 + 6;
  const boxW = 214;
  const boxH = 46;
  const top = Math.max(ctx.L.drawTop + 4, yCall - 34 - boxH) + rise;
  const headline = call.message.text.split(". ")[0];
  const who = call.message.source === "mud-logger" ? "Mud logger" : "Driller";
  return (
    <g opacity={opacity}>
      <path
        d={`M${x + 18} ${top + boxH} V${yCall - 6} L${w.rop!.x1 + 3} ${yCall}`}
        style={{ fill: "none", stroke: "var(--ink-bright)" }}
        strokeWidth={1.2}
      />
      <rect x={x} y={top} width={boxW} height={boxH} rx={2} style={{ fill: "var(--paper-deep)", stroke: "var(--ink-bright)" }} strokeWidth={1} />
      <rect x={x} y={top} width={3} height={boxH} style={{ fill: "var(--ink-bright)" }} />
      <text x={x + 12} y={top + 17} fontSize={10} className="label-caps" style={{ fill: "var(--ink-muted)" }}>
        {`${who} · ${clock(call.message.time)}`}
      </text>
      <text x={x + 12} y={top + 36} fontSize={14.5} fontWeight={600} style={{ fill: "var(--ink-bright)" }}>
        {headline}
      </text>
    </g>
  );
}
