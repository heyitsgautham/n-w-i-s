"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A label that breaks the lines it sits on, the way dimension text does on a drawing.
 * Children are drawn relative to (x, y); the plate is measured once per `label` and then follows
 * (x, y), so labels can slide during the re-tie without re-measuring every frame.
 */
export function Plate({
  x,
  y,
  label,
  fill = "var(--paper)",
  opacity = 0.94,
  pad = 3,
  children,
}: {
  x: number;
  y: number;
  label: string;
  fill?: string;
  opacity?: number;
  pad?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<SVGGElement>(null);
  const [box, setBox] = useState<{ label: string; dx: number; dy: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    const b = g.getBBox();
    const ax = Number(g.dataset.x);
    const ay = Number(g.dataset.y);
    setBox({ label, dx: b.x - ax, dy: b.y - ay, w: b.width, h: b.height });
  }, [label]);
  return (
    <g>
      {box && box.label === label && (
        <rect x={x + box.dx - pad} y={y + box.dy - pad + 1} width={box.w + pad * 2} height={box.h + pad * 2 - 2} rx={2} style={{ fill }} opacity={opacity} />
      )}
      <g ref={ref} data-x={x} data-y={y}>
        {children}
      </g>
    </g>
  );
}
