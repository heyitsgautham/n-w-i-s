"use client";

import type { BriefingSection, Citation, OffsetEvent } from "@wells/correlate";
import { Download, FileDown, Loader2, PencilLine, X } from "lucide-react";
import { useState } from "react";
import { useConsole } from "@/components/console/console-provider";
import { API } from "@/lib/api";
import { dayLabel, metres } from "@/lib/format";

interface Props {
  wellId: string;
  radiusKm: number;
  offsets: { id: string; km: number; year: number }[];
  sections: BriefingSection[];
  events: OffsetEvent[];
  pending: number;
  formations: { id: string; name: string }[];
}

const citeLabel = (c: Citation) => `${c.wellId} · ${dayLabel(c.date)} · p.${c.page ?? "?"}`;

export function BriefingScreen({ wellId, radiusKm, offsets, sections, events, pending, formations }: Props) {
  const { openEvent } = useConsole();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ id: string; pages: number; url: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const name = (id: string) => formations.find((f) => f.id === id)?.name ?? id;
  const textOf = (id: string, fallback: string) => edits[id] ?? fallback;

  async function exportPdf() {
    setExporting(true);
    const body = {
      title: `Offset review for ${wellId}`,
      subtitle: `Pre-spud briefing by hole section. Offsets within ${radiusKm} km: ${offsets.map((o) => o.id).join(", ")}. Every line cites the daily drilling report it came from.`,
      footer: "N-W-I-S working prototype. Synthetic demo pack, not Oil India data.",
      sections: sections.map((s) => ({
        title: `${s.sizeIn} in hole, ${metres(s.topMd)} to ${metres(s.shoeMd)} m MD, ${s.casingIn} in casing`,
        summary: s.formations.map(name).join(", "),
        lines: s.lines.map((l) => ({ text: textOf(l.id, l.text), cites: l.cites.map((c) => `DDR ${c.docId}, p.${c.page}`) })),
      })),
    };
    try {
      const res = await fetch(`${API}/briefing/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        setExported(await res.json());
        setPreview(true);
      }
    } finally {
      setExporting(false);
    }
  }

  const edited = Object.keys(edits).length;
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_clamp(340px,21vw,400px)]">
      <section className="min-h-0 overflow-y-auto border-r border-rule px-8 pt-5 pb-10" data-briefing>
        <header>
          <div className="label-caps text-[10.5px] text-ink-dim">Pre-spud briefing</div>
          <h1 className="mt-1 text-[24px] leading-tight font-semibold text-ink-bright">Offset review for {wellId}, hole section by hole section</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">
            Written from {events.length} cited offset events in {offsets.length} wells within {radiusKm} km. Click any line to change it; click a citation to open the page.
          </p>
        </header>
        <div className="mt-5 flex flex-col gap-5">
          {sections.map((s) => (
            <article key={s.sizeIn} className="rounded-[4px] border border-rule bg-[color-mix(in_srgb,var(--paper)_70%,transparent)]" data-section={s.sizeIn}>
              <div className="flex items-baseline justify-between gap-4 border-b border-rule px-5 py-3">
                <h2 className="text-[17px] font-semibold text-ink-bright">
                  {s.sizeIn} in hole
                  <span className="num ml-2.5 text-[13px] font-normal text-ink-muted">
                    {metres(s.topMd)}–{metres(s.shoeMd)} m MD · {s.casingIn} in casing
                  </span>
                </h2>
                <span className="text-[12.5px] text-ink-muted">
                  {s.formations.map(name).join(", ")} · {s.eventCount} {s.eventCount === 1 ? "event" : "events"}
                </span>
              </div>
              {s.lines.length === 0 ? (
                <p className="px-5 py-3 text-[13.5px] text-ink-dim">No offset events in this section within {radiusKm} km, so nothing to cite.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-rule">
                  {s.lines.map((l) => (
                    <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 px-5 py-2.5" data-line={l.id}>
                      <div className="flex items-start gap-2">
                        <span
                          contentEditable
                          suppressContentEditableWarning
                          spellCheck={false}
                          onInput={(e) => {
                            const text = e.currentTarget.textContent ?? "";
                            setEdits((m) => ({ ...m, [l.id]: text }));
                          }}
                          className="-mx-1 rounded-[2px] px-1 text-[14.5px] leading-snug text-ink outline-none focus:bg-accent focus:ring-1 focus:ring-ink-muted/60"
                        >
                          {l.text}
                        </span>
                        {edits[l.id] !== undefined && edits[l.id] !== l.text && (
                          <span className="label-caps mt-1 flex shrink-0 items-center gap-1 text-[9px] text-watch">
                            <PencilLine className="size-3" /> edited
                          </span>
                        )}
                      </div>
                      <div className="flex max-w-[620px] flex-wrap justify-end gap-1">
                        {l.cites.map((c) => {
                          const ev = events.find((e) => e.id === c.eventId);
                          return (
                            <button
                              key={c.eventId}
                              type="button"
                              onClick={() => ev && openEvent(ev)}
                              className="num rounded-[2px] border border-rule-strong px-1.5 py-0.5 text-[11px] whitespace-nowrap text-ink-muted hover:border-ink-muted hover:text-ink"
                            >
                              {citeLabel(c)}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>
      <aside className="flex min-h-0 flex-col gap-5 bg-chrome px-5 pt-5 pb-4">
        <div>
          <h2 className="label-caps text-[11px] text-ink-muted">Analogue set</h2>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {offsets.map((o) => (
              <li key={o.id} className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-medium text-ink-bright">{o.id}</span>
                <span className="num text-[11.5px] text-ink-muted">
                  {o.km} km · {o.year}
                </span>
              </li>
            ))}
          </ul>
          {pending > 0 && (
            <p className="mt-3 text-[12px] leading-snug text-ink-muted">
              {pending} {pending === 1 ? "event is" : "events are"} waiting in the review queue and left out until someone confirms {pending === 1 ? "it" : "them"}.
            </p>
          )}
        </div>
        <div className="rounded-[4px] border border-rule-strong p-4">
          <div className="flex items-baseline justify-between">
            <span className="label-caps text-[10.5px] text-ink-muted">Export</span>
            <span className="text-[12px] text-ink-dim">{edited ? `${edited} ${edited === 1 ? "line" : "lines"} edited` : "as written"}</span>
          </div>
          <button
            type="button"
            onClick={exportPdf}
            disabled={exporting}
            data-export
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[3px] bg-ink-bright py-2.5 text-[14px] font-semibold text-[#0b0f19] hover:bg-ink disabled:opacity-60"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            Export PDF with citations
          </button>
          {exported && (
            <a href={`${API}${exported.url}`} className="mt-3 flex items-center gap-2 text-[13px] text-ink-muted hover:text-ink">
              <Download className="size-4" /> briefing-{wellId}.pdf · {exported.pages} {exported.pages === 1 ? "page" : "pages"}
            </a>
          )}
        </div>
        <p className="mt-auto text-[11.5px] leading-snug text-ink-dim">
          Lines are built only from parsed offset events that cleared review. A line with nothing to cite is not written.
        </p>
      </aside>
      {preview && exported && (
        <div className="fixed inset-x-0 top-[60px] bottom-7 z-40 flex items-center justify-center bg-[#01040b]/70" onClick={() => setPreview(false)} data-export-preview>
          <div className="flex h-[92%] flex-col overflow-hidden rounded-[4px] border border-rule-strong bg-chrome shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-6 border-b border-rule px-4 py-2.5">
              <span className="num text-[13px] text-ink">
                briefing-{wellId}.pdf · page 1 of {exported.pages}
              </span>
              <button type="button" onClick={() => setPreview(false)} aria-label="Close preview" className="text-ink-muted hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- the exported PDF's first page, rendered by the API */}
            <img src={`${API}/briefing/${exported.id}/pages/1.png?scale=1.6`} alt="Exported briefing, first page" className="min-h-0 flex-1 bg-white object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
