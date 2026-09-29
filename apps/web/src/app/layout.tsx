import type { Metadata } from "next";
import { Barlow_Semi_Condensed, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { BRAND, TAGLINE } from "@/lib/brand";

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
  title: `${BRAND} · ${TAGLINE}`,
  description: "Offset-well memory for the active well. Alerts tied to formations, re-tied live when a top comes in off prognosis.",
};

/**
 * `?film=1` turns on the recording layout for the rest of the tab's session: secondary labels hide and
 * the rail text grows, so a frame reads at video size. It runs before hydration so no frame shows the
 * other layout. The app is the same app; only density changes.
 */
const FILM_MODE = `try{var q=new URLSearchParams(location.search).get("film");if(q==="1")sessionStorage.setItem("film-mode","1");if(q==="0")sessionStorage.removeItem("film-mode");if(sessionStorage.getItem("film-mode")==="1")document.documentElement.dataset.film="1"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${barlow.variable} ${jetbrains.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: FILM_MODE }} />
      </head>
      <body className="flex h-full min-h-0 flex-col overflow-hidden">
        {children}
      </body>
    </html>
  );
}
