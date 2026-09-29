import { rng } from "./rng";
import { ACTIVE, GENERATED_OFFSETS as G, SECTION_OFFSETS, STRUCTURE } from "./scenario";

export interface Placement {
  id: string;
  x: number;
  y: number;
  /** Year the well was meant to spud, before the rig schedule moves it. */
  targetYear: number;
}

/** Places the generated offsets: a few inside 5 km, the rest in a ring beyond, never closer than a pad spacing. */
export function placeGeneratedOffsets(seed: number): Placement[] {
  const r = rng(seed, "field/layout");
  const placed: { x: number; y: number }[] = [{ x: ACTIVE.x, y: ACTIVE.y }, ...SECTION_OFFSETS.map((o) => ({ x: o.x, y: o.y }))];
  const insideIds = new Set<string>();
  const pool = [...G.ids];
  while (insideIds.size < G.inside5km) insideIds.add(pool.splice(r.int(0, pool.length - 1), 1)[0]!);

  const { x0, y0, step, nx, ny } = STRUCTURE.grid;
  const inBounds = (x: number, y: number) => x > x0 + 600 && x < x0 + step * (nx - 1) - 600 && y > y0 + 600 && y < y0 + step * (ny - 1) - 600;
  return G.ids.map((id, i) => {
    const [rMin, rMax] = insideIds.has(id) ? G.innerRadius : G.outerRadius;
    for (let attempt = 0; attempt < 500; attempt++) {
      const radius = r.range(rMin, rMax);
      const angle = r.range(0, 2 * Math.PI);
      const x = Math.round(ACTIVE.x + radius * Math.sin(angle));
      const y = Math.round(ACTIVE.y + radius * Math.cos(angle));
      if (!inBounds(x, y)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < G.minSpacing)) continue;
      placed.push({ x, y });
      const targetYear = G.firstYear + (i / (G.ids.length - 1)) * (G.lastYear - G.firstYear);
      return { id, x, y, targetYear };
    }
    throw new Error(`could not place ${id}`);
  });
}

export interface RigSlot {
  rig: string;
  start: number;
  end: number;
}

const DAY = 86_400_000;

/**
 * Finds a spud date on some rig no earlier than the target, so that no rig drills two wells at once.
 * `busy` holds every committed slot and is updated in place.
 */
export function scheduleSpud(seed: number, id: string, targetYear: number, durationDays: number, busy: RigSlot[]): { rig: string; spudDate: string } {
  const r = rng(seed, `${id}/schedule`);
  const target = Date.UTC(Math.floor(targetYear), 0, 1) + Math.floor((targetYear % 1) * 365 + r.range(0, 60)) * DAY;
  const need = (durationDays + G.rigMoveDays) * DAY;
  const latest = Date.UTC(G.lastYear, 11, 31);
  const firstRig = r.int(0, G.rigs.length - 1);
  let best: { rig: string; start: number } | null = null;
  for (let k = 0; k < G.rigs.length; k++) {
    const rig = G.rigs[(firstRig + k) % G.rigs.length]!;
    const slots = busy.filter((b) => b.rig === rig).sort((a, b) => a.start - b.start);
    let start = target;
    for (const s of slots) if (start < s.end && start + need > s.start) start = s.end;
    if (start + need <= latest && (!best || start < best.start)) best = { rig, start };
  }
  if (!best) throw new Error(`no rig free for ${id}`);
  busy.push({ rig: best.rig, start: best.start, end: best.start + need });
  return { rig: best.rig, spudDate: new Date(best.start).toISOString().slice(0, 10) };
}

export function slotOf(rig: string, spudDate: string, durationDays: number): RigSlot {
  const start = Date.parse(`${spudDate}T00:00:00Z`);
  return { rig, start, end: start + (durationDays + G.rigMoveDays) * DAY };
}
