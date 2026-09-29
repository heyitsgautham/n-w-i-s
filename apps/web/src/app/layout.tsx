import type { Metadata } from "next";
import { Barlow_Semi_Condensed, JetBrains_Mono } from "next/font/google";
import { ConsoleProvider } from "@/components/console/console-provider";
import { NavRail } from "@/components/console/nav-rail";
import { EventDrawer } from "@/components/drawer/event-drawer";
import { TopBar } from "@/components/hero/top-bar";
import { liveEvents, loadField } from "@/lib/data";
import { buildHeroModel } from "@/lib/hero-model";
import "./globals.css";

// Barlow's DIN-like grotesk reads like rig signage and instrument panels.
// JetBrains Mono carries every depth, time and mud weight so digits line up in columns.
const barlow = Barlow_Semi_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "N-W-I-S · Offset-well memory",
  description: "Offset-well memory for the active well. Alerts tied to formations, re-tied live when a top comes in off prognosis.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const model = buildHeroModel(loadField(), await liveEvents());
  return (
    <html lang="en" className={`${barlow.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex h-full min-h-0 flex-col overflow-hidden">
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
      </body>
    </html>
  );
}
