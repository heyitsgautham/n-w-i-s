import { CompareScreen, type CompareModel } from "@/components/compare/compare-screen";
import { liveEvents, loadField } from "@/lib/data";

/** Days-versus-depth for the section offsets and the active well's plan, with casing and mud programs. */
export default async function ComparePage() {
  const field = loadField();
  const events = await liveEvents();
  const ids = [field.activeWellId, ...field.sectionOrder.filter((id) => id !== field.activeWellId)];
  const model: CompareModel = {
    activeWellId: field.activeWellId,
    wells: ids.map((id) => {
      const w = field.wells.find((x) => x.id === id)!;
      return {
        id,
        role: w.role,
        spudDate: w.spudDate,
        tdMd: w.role === "active" ? w.sections[w.sections.length - 1]!.shoeMd : w.tdMd,
        curve: w.curve,
        planCurve: w.planCurve ?? null,
        sections: w.sections,
        mud: w.mud,
        events: events.filter((e) => e.wellId === id),
      };
    }),
  };
  return <CompareScreen model={model} />;
}
