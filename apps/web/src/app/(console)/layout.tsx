import { ConsoleProvider } from "@/components/console/console-provider";
import { NavRail } from "@/components/console/nav-rail";
import { EventDrawer } from "@/components/drawer/event-drawer";
import { TopBar } from "@/components/hero/top-bar";
import { liveEvents, loadField } from "@/lib/data";
import { buildHeroModel } from "@/lib/hero-model";

/** The rig console: live telemetry across the top, screens on the left, the report drawer over everything. */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const model = buildHeroModel(loadField(), await liveEvents());
  return (
    <ConsoleProvider model={model}>
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="min-h-0 min-w-0 flex-1">{children}</main>
      </div>
      <footer className="flex h-7 shrink-0 items-center border-t border-rule bg-chrome px-4 text-[12px] tracking-[0.04em] text-ink-dim">
        Target product · working prototype · synthetic data
      </footer>
      <EventDrawer />
    </ConsoleProvider>
  );
}
