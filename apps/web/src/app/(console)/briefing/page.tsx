import { composeBriefing } from "@wells/correlate";
import { BriefingScreen } from "@/components/briefing/briefing-screen";
import { liveEvents, loadField } from "@/lib/data";

const RADIUS_KM = 5;

/** The pre-spud offset review for the active well's plan, written from the parsed offset reports. */
export default async function BriefingPage() {
  const field = loadField();
  const events = await liveEvents();
  const active = field.wells.find((w) => w.id === field.activeWellId)!;
  const offsets = field.wells.filter((w) => w.role === "offset" && Math.hypot(w.x - active.x, w.y - active.y) <= RADIUS_KM * 1000);
  const ids = new Set(offsets.map((w) => w.id));
  const inRing = events.filter((e) => ids.has(e.wellId));
  const sections = composeBriefing({
    sections: active.sections,
    prognosis: active.tops,
    offsets,
    events: inRing,
    formationName: (id) => field.formations.find((f) => f.id === id)?.name ?? id,
  });
  const cited = new Set(sections.flatMap((s) => s.lines.flatMap((l) => l.cites.map((c) => c.eventId))));
  return (
    <BriefingScreen
      wellId={active.id}
      radiusKm={RADIUS_KM}
      offsets={offsets
        .map((w) => ({ id: w.id, km: Math.round(Math.hypot(w.x - active.x, w.y - active.y) / 100) / 10, year: Number(w.spudDate.slice(0, 4)) }))
        .sort((a, b) => a.km - b.km)}
      sections={sections}
      events={inRing.filter((e) => cited.has(e.id))}
      pending={inRing.filter((e) => e.needsReview).length}
      formations={field.formations.map((f) => ({ id: f.id, name: f.name }))}
    />
  );
}
