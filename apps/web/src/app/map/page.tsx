import { formationAtMd, rankAnalogues, type Analogue } from "@wells/correlate";
import { MapScreen, type MapModel } from "@/components/map/map-screen";
import { liveEvents, loadField } from "@/lib/data";

const INTERVALS = ["TPM", "BCS", "BMS", "KPL", "SYL"];

export default async function MapPage() {
  const field = loadField();
  const events = await liveEvents();
  const active = field.wells.find((w) => w.id === field.activeWellId)!;
  const offsets = field.wells.filter((w) => w.role === "offset");
  const rankings: Record<string, Analogue[]> = {};
  for (const f of INTERVALS) rankings[f] = rankAnalogues(active, active.tops, offsets, f, field.faults);
  const eventCounts: Record<string, Record<string, number>> = {};
  for (const e of events) {
    const w = offsets.find((x) => x.id === e.wellId);
    const f = w && formationAtMd(w.tops, e.md);
    if (!f) continue;
    eventCounts[e.wellId] ??= {};
    eventCounts[e.wellId]![f] = (eventCounts[e.wellId]![f] ?? 0) + 1;
  }
  const model: MapModel = {
    activeWellId: field.activeWellId,
    wells: field.wells.map((w) => ({ id: w.id, role: w.role, x: w.x, y: w.y, spudYear: Number(w.spudDate.slice(0, 4)) })),
    sectionOrder: field.sectionOrder,
    structure: field.structure,
    faults: field.faults,
    formations: field.formations.filter((f) => INTERVALS.includes(f.id)),
    rankings,
    eventCounts,
    defaultInterval: "BCS",
  };
  return <MapScreen model={model} />;
}
