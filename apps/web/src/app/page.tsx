import { OpenWell } from "@/components/home/open-well";
import { loadField } from "@/lib/data";

/** Where an engineer starts: one field, the well they are on shift for. */
export default function Home() {
  const field = loadField();
  return <OpenWell activeWellId={field.activeWellId} fieldName={field.field.name} wells={field.wells.length} />;
}
