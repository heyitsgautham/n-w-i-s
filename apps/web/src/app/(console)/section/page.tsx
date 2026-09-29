import { Arrival } from "@/components/arrival/arrival";
import { SectionScreen } from "@/components/hero/hero-screen";
import { arrivalData } from "@/lib/data";

/**
 * The correlation section, the hero. Live state comes from the console provider in the layout.
 * `?arrive=1`, set by "Open well" on the home screen, plays the arrival over it first.
 */
export default async function SectionPage(props: PageProps<"/section">) {
  const { arrive } = await props.searchParams;
  return (
    <>
      <SectionScreen />
      {arrive === "1" && <Arrival data={await arrivalData()} />}
    </>
  );
}
