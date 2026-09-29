"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BRAND, TAGLINE } from "@/lib/brand";

/** The column the logo is drawn from, top to bottom, in the section's own lithology colours. */
const COLUMN = ["gravel", "clay", "sandstone", "shale", "sandstone", "shale", "limestone"] as const;

function Mark() {
  return (
    <svg width="56" height="78" viewBox="0 0 46 64" aria-hidden>
      {COLUMN.map((l, i) => (
        <rect key={i} x="4" y={4 + i * 8} width="38" height="8" style={{ fill: `var(--lith-${l})` }} opacity={0.85} />
      ))}
      <path d="M23 0V52" style={{ stroke: "var(--bg)" }} strokeWidth="5" />
      <path d="M23 0V50" style={{ stroke: "var(--ink-bright)" }} strokeWidth="2" />
      <path d="M17 47H29L23 56Z" style={{ fill: "var(--ink-bright)" }} />
    </svg>
  );
}

export function OpenWell({ activeWellId, fieldName, wells }: { activeWellId: string; fieldName: string; wells: number }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [miss, setMiss] = useState<string | null>(null);
  const open = (e: React.FormEvent) => {
    e.preventDefault();
    const id = value.trim().toUpperCase().replace(/\s+/g, "");
    if (id === activeWellId) router.push("/section?arrive=1");
    else setMiss(id);
  };
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-background" data-home>
      <div className="w-[680px]">
        <div className="flex items-center gap-5">
          <Mark />
          <div>
            <h1 className="text-[64px] leading-none font-bold tracking-[0.1em] text-ink-bright">{BRAND}</h1>
            <p className="mt-2 text-[23px] text-ink-muted">{TAGLINE}</p>
          </div>
        </div>
        <form onSubmit={open} className="mt-12" data-open-well>
          <label htmlFor="well" className="label-caps text-[13px] text-ink-muted">
            Open a well
          </label>
          <div className="mt-2.5 flex gap-2.5">
            <input
              id="well"
              name="well"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setMiss(null);
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Well name"
              className="num h-[64px] min-w-0 flex-1 rounded-[4px] border border-rule-strong bg-paper px-5 text-[27px] text-ink-bright outline-none placeholder:font-sans placeholder:text-[21px] placeholder:text-ink-faint focus:border-ink-muted"
            />
            <button
              type="submit"
              disabled={!value.trim()}
              className="flex h-[64px] items-center gap-2 rounded-[4px] bg-ink-bright px-6 text-[20px] font-semibold text-[#0b0f19] transition-opacity disabled:opacity-35"
              data-open-button
            >
              Open well <ArrowRight className="size-[20px]" />
            </button>
          </div>
          <p className="mt-3.5 h-6 text-[15.5px] text-ink-dim" aria-live="polite">
            {miss ? `${miss} is not drilling in this pack. The active well is ${activeWellId}.` : `${fieldName} field · ${wells} wells`}
          </p>
        </form>
      </div>
      <footer className="absolute inset-x-0 bottom-0 flex h-7 items-center border-t border-rule bg-chrome px-4 text-[12px] tracking-[0.04em] text-ink-dim">
        Target product · working prototype · synthetic data
      </footer>
    </main>
  );
}
