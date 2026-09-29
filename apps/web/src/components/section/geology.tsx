import type { Formation, Lithology } from "@wells/correlate";
import type { SectionFault } from "@/lib/hero-model";
import type { DisplayInterval, SectionLayout, WellLayout } from "./layout";
import { lithFill } from "./patterns";

interface GapProps {
  L: SectionLayout;
  a: WellLayout;
  b: WellLayout;
  ia: DisplayInterval[];
  ib: DisplayInterval[];
  fault?: SectionFault;
  lithOf: (formationId: string) => Lithology;
}

/** Fault trace x at a given y. Drawn slightly inclined, down to the east. */
function faultX(L: SectionLayout, a: WellLayout, b: WellLayout, f: SectionFault, y: number) {
  const x0 = a.right + f.at * (b.left - a.right);
  const t = (y - L.drawTop) / (L.drawBottom - L.drawTop);
  return x0 - 6 + 12 * t;
}

/** Depths either side of the fault for a horizon that sits at dA in the west well and dB in the east. */
function acrossFault(dA: number, dB: number, f: SectionFault) {
  const west = dA + (dB - f.throwM - dA) * f.at;
  return { west, east: west + f.throwM };
}

function pairs(ia: DisplayInterval[], ib: DisplayInterval[]) {
  return ia.flatMap((x) => {
    const y = ib.find((v) => v.formationId === x.formationId);
    return y ? [{ id: x.formationId, a: x, b: y }] : [];
  });
}

/** Colour wash between wells, the hand-coloured part of the section. */
export function GapFills({ L, a, b, ia, ib, fault, lithOf }: GapProps) {
  const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <g>
      {pairs(ia, ib).map(({ id, a: A, b: B }) => {
        const style = { fill: lithFill(lithOf(id)) };
        if (!fault) {
          return (
            <polygon
              key={id}
              points={pts([
                [a.right, L.y(A.top)],
                [b.left, L.y(B.top)],
                [b.left, L.y(B.base)],
                [a.right, L.y(A.base)],
              ])}
              style={style}
              opacity={0.27}
            />
          );
        }
        const top = acrossFault(A.top, B.top, fault);
        const base = acrossFault(A.base, B.base, fault);
        const fx = (d: number) => faultX(L, a, b, fault, L.y(d));
        return (
          <g key={id} style={style} opacity={0.27}>
            <polygon
              points={pts([
                [a.right, L.y(A.top)],
                [fx(top.west), L.y(top.west)],
                [fx(base.west), L.y(base.west)],
                [a.right, L.y(A.base)],
              ])}
            />
            <polygon
              points={pts([
                [fx(top.east), L.y(top.east)],
                [b.left, L.y(B.top)],
                [b.left, L.y(B.base)],
                [fx(base.east), L.y(base.east)],
              ])}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Tie lines join the same top across a gap. Dashed where either end is still a prognosis. */
export function TieLines({ L, a, b, ia, ib, fault, highlight }: Omit<GapProps, "lithOf"> & { highlight?: string }) {
  return (
    <g fill="none">
      {pairs(ia, ib).map(({ id, a: A, b: B }) => {
        if (A.top < L.windowTop - 200 || B.top < L.windowTop - 200) return null;
        const dashed = A.status === "prognosed" || B.status === "prognosed";
        const hot = id === highlight && !dashed;
        const style = { stroke: hot ? "var(--ink-bright)" : "var(--ink)" };
        const common = {
          style,
          strokeWidth: hot ? 1.6 : 1.1,
          strokeDasharray: dashed ? "5 4" : undefined,
          opacity: hot ? 0.95 : dashed ? 0.7 : 0.75,
        };
        if (!fault) return <line key={id} x1={a.right} y1={L.y(A.top)} x2={b.left} y2={L.y(B.top)} {...common} />;
        const t = acrossFault(A.top, B.top, fault);
        return (
          <g key={id}>
            <line x1={a.right} y1={L.y(A.top)} x2={faultX(L, a, b, fault, L.y(t.west))} y2={L.y(t.west)} {...common} />
            <line x1={faultX(L, a, b, fault, L.y(t.east))} y1={L.y(t.east)} x2={b.left} y2={L.y(B.top)} {...common} />
          </g>
        );
      })}
    </g>
  );
}

export function FaultTrace({ L, a, b, fault }: { L: SectionLayout; a: WellLayout; b: WellLayout; fault: SectionFault }) {
  const x0 = faultX(L, a, b, fault, L.drawTop);
  const x1 = faultX(L, a, b, fault, L.drawBottom);
  const my = L.drawTop + (L.drawBottom - L.drawTop) * 0.62;
  const mx = faultX(L, a, b, fault, my);
  return (
    <g>
      <line x1={x0} y1={L.drawTop} x2={x1} y2={L.drawBottom} style={{ stroke: "#c2663a" }} strokeWidth={1.6} />
      {/* Half arrows: west block up, east block down. */}
      <path d={`M${mx - 5} ${my + 10} v-16 l-3.5 5`} style={{ stroke: "#c2663a", fill: "none" }} strokeWidth={1.2} />
      <path d={`M${mx + 5} ${my - 6} v16 l3.5 -5`} style={{ stroke: "#c2663a", fill: "none" }} strokeWidth={1.2} />
      <text x={x0 + 6} y={L.drawTop + 14} className="num" fontSize={11} fontWeight={600} style={{ fill: "#e29a74" }}>
        {fault.name}
      </text>
      <text x={x0 + 6} y={L.drawTop + 27} className="num" fontSize={10} style={{ fill: "#b9876c" }}>
        {`${fault.throwM} m`}
      </text>
    </g>
  );
}

/** Formation names lettered into the wash of one gap, the way a drafter labels a section. */
export function FormationNames({
  L,
  a,
  b,
  ia,
  ib,
  formations,
}: Omit<GapProps, "lithOf" | "fault"> & { formations: Formation[] }) {
  const cx = (a.right + b.left) / 2;
  return (
    <g>
      {pairs(ia, ib).map(({ id, a: A, b: B }) => {
        const top = Math.max(L.drawTop, L.y((A.top + B.top) / 2));
        const base = Math.min(L.drawBottom, L.y((A.base + B.base) / 2));
        if (base - top < 34) return null;
        const f = formations.find((x) => x.id === id);
        if (!f) return null;
        // 11 px Barlow capitals run about 6 px a character, plus the tracking.
        const room = b.left - a.right - 12;
        const width = (t: string, em: number) => t.length * (6 + 11 * em);
        const pick = [
          { text: f.name, em: 0.2 },
          { text: f.short, em: 0.2 },
          { text: f.short, em: 0.06 },
        ].find((o) => width(o.text, o.em) <= room);
        if (!pick) return null;
        return (
          <text
            key={id}
            x={cx}
            y={(top + base) / 2 + 4}
            textAnchor="middle"
            fontSize={11}
            className="label-caps"
            style={{ fill: "var(--ink)", stroke: "var(--paper)", strokeWidth: 3, paintOrder: "stroke", letterSpacing: `${pick.em}em` }}
            opacity={0.78}
          >
            {pick.text}
          </text>
        );
      })}
    </g>
  );
}
