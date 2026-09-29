"use client";

import type { OffsetEvent } from "@wells/correlate";
import { Check, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useConsole } from "@/components/console/console-provider";
import { API } from "@/lib/api";
import { dayLabel, metres } from "@/lib/format";

interface Bin {
  from: number;
  to: number;
  count: number;
}

interface Ingestion {
  documents: number;
  pages: number;
  ocrPages: number;
  textPages: number;
  wells: number;
  events: number;
  needsReview: number;
  reviewThreshold: number;
  eventConfidence: Bin[];
  ocrPageConfidence: Bin[];
  accuracy: { truthEvents: number; extractedEvents: number; recall: number; kindCorrect: number; depthExact: number; mudWeightExact: number; nptExact: number };
  pendingReview: number;
  confirmed: number;
  rejected: number;
  scannedDocuments: number;
  volve: { files: number; parsed: number; activities: number } | null;
}

type ReviewItem = OffsetEvent & { fieldConfidence: Record<string, number>; reviewed: "confirm" | "reject" | null };

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Histogram({ title, bins, threshold, unit }: { title: string; bins: Bin[]; threshold: number; unit: string }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const h = 120;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="label-caps text-[10.5px] text-ink-muted">{title}</h3>
        <span className="text-[11.5px] text-ink-dim">{unit}</span>
      </div>
      <div className="relative mt-3 flex items-end gap-1" style={{ height: h }}>
        {bins.map((b) => {
          const below = b.to <= threshold + 1e-9;
          return (
            <div key={b.from} className="relative flex flex-1 flex-col items-center justify-end" style={{ height: h }}>
              {b.count > 0 && <span className="num mb-1 text-[10.5px] text-ink-muted">{b.count}</span>}
              <div className="w-full rounded-t-[2px]" style={{ height: Math.max(b.count ? 3 : 0, (b.count / max) * (h - 18)), background: below ? "var(--watch)" : "var(--ink-muted)", opacity: below ? 0.9 : 0.6 }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {bins.map((b) => (
          <span key={b.from} className="num flex-1 text-center text-[9.5px] text-ink-dim">
            {b.from === 0 ? `<${b.to.toFixed(2).slice(1)}` : b.from.toFixed(2).slice(1)}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink-dim">
        Amber bars fall under the {threshold.toFixed(2)} review threshold.
      </p>
    </div>
  );
}

function PageCrop({ e }: { e: OffsetEvent }) {
  const b = e.source.bbox;
  if (!b) return null;
  const w = 360;
  const z = w / (b[2] - b[0] + 16);
  const h = (b[3] - b[1] + 12) * z;
  return (
    <div
      className="rounded-[2px] border border-rule-strong bg-white"
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${API}/documents/${e.source.docId}/pages/${e.source.page}.png?scale=2)`,
        backgroundSize: `${595.28 * z}px ${841.89 * z}px`,
        backgroundPosition: `${-(b[0] - 8) * z}px ${-(b[1] - 6) * z}px`,
      }}
      role="img"
      aria-label="Scanned passage"
    />
  );
}

function ReviewCard({ e, onDecide }: { e: ReviewItem; onDecide: (id: string, d: "confirm" | "reject") => void }) {
  const { openEvent } = useConsole();
  const fields: [string, string, number | undefined][] = [
    ["Type", e.kind.replace("-", " "), e.fieldConfidence.kind],
    ["Title", e.fieldConfidence.title ? e.title : "unread", e.fieldConfidence.title],
    ["Depth", e.md === null ? "unread" : `${metres(e.md, 1)} m`, e.fieldConfidence.depth],
    ["MW", e.mudWeightPpg === null ? "unread" : `${e.mudWeightPpg} ppg`, e.fieldConfidence.mudWeight],
    ["NPT", e.nptHours === null ? "unread" : `${e.nptHours} h`, e.fieldConfidence.npt],
  ];
  return (
    <li className="rounded-[4px] border border-rule-strong bg-[color-mix(in_srgb,var(--paper)_70%,transparent)] p-3.5" data-review={e.id}>
      <div className="flex items-baseline justify-between gap-3">
        <button type="button" onClick={() => openEvent(e)} className="flex min-w-0 items-center gap-1 text-left text-[14.5px] font-semibold text-ink-bright hover:underline">
          <span className="truncate">
            {e.wellId} · {e.title}
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-dim" />
        </button>
        <span className="num shrink-0 text-[15px] font-semibold text-watch">{e.confidence.toFixed(2)}</span>
      </div>
      <div className="num mt-0.5 text-[11.5px] text-ink-muted">
        DDR {dayLabel(e.date)} p.{e.source.page} · scanned page, read by OCR
      </div>
      <div className="mt-2.5 grid grid-cols-[360px_minmax(0,1fr)] gap-4">
        <PageCrop e={e} />
        <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] content-start gap-x-3 gap-y-1.5 text-[12.5px]">
          {fields.map(([k, v, c]) => (
            <div key={k} className="contents">
              <dt className="label-caps text-[9.5px] leading-[18px] text-ink-dim">{k}</dt>
              <dd className="num truncate text-ink">{v}</dd>
              <dd className={`num text-right ${c !== undefined && c < 0.85 ? "text-watch" : "text-ink-muted"}`}>{c?.toFixed(2)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {e.reviewed ? (
          <span className={`label-caps text-[10.5px] ${e.reviewed === "confirm" ? "text-ink-bright" : "text-ink-dim"}`}>
            {e.reviewed === "confirm" ? "Confirmed, can raise alerts" : "Rejected, left out"}
          </span>
        ) : (
          <>
            <button type="button" onClick={() => onDecide(e.id, "confirm")} data-confirm={e.id} className="flex items-center gap-1.5 rounded-[3px] bg-ink-bright px-3 py-1.5 text-[13px] font-semibold text-[#0b0f19] hover:bg-ink">
              <Check className="size-4" /> Confirm
            </button>
            <button type="button" onClick={() => onDecide(e.id, "reject")} className="flex items-center gap-1.5 rounded-[3px] border border-rule-strong px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink">
              <X className="size-4" /> Reject
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function IngestionScreen() {
  const router = useRouter();
  const [data, setData] = useState<Ingestion | null>(null);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([fetch(`${API}/ingestion`).then((r) => r.json()), fetch(`${API}/review`).then((r) => r.json())])
      .then(([i, q]) => {
        if (!live) return;
        setData(i as Ingestion);
        setQueue(q as ReviewItem[]);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [version]);
  const decide = async (id: string, decision: "confirm" | "reject") => {
    await fetch(`${API}/review/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    setVersion((v) => v + 1);
    router.refresh();
  };

  if (error) return <p className="p-6 text-[14px] text-prepare">The API is not answering ({error}). Start it with `pnpm dev`.</p>;
  if (!data) return <p className="p-6 text-[14px] text-ink-muted">Loading the parse run…</p>;
  const a = data.accuracy;
  const missed = a.truthEvents - Math.round(a.recall * a.truthEvents);
  const cleared = data.events - data.pendingReview - data.rejected;
  const stages = [
    { n: data.documents, label: "daily reports", sub: `${data.pages} pages, ${data.wells} wells` },
    { n: data.textPages, label: "text-layer pages", sub: "read directly" },
    { n: data.ocrPages, label: "scanned pages", sub: "read by Tesseract OCR" },
    { n: data.events, label: "incidents parsed", sub: "each with page and box" },
    { n: data.pendingReview, label: "waiting for review", sub: `under ${data.reviewThreshold.toFixed(2)}`, warn: true },
    { n: cleared, label: "cleared for alerts", sub: `${data.confirmed} confirmed by hand` },
  ];

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-rule px-6 pt-5 pb-5">
        <header>
          <div className="label-caps text-[10.5px] text-ink-dim">Ingestion</div>
          <h1 className="mt-1 text-[22px] leading-tight font-semibold text-ink-bright">Every daily report, parsed into events that cite their page</h1>
        </header>
        <ol className="grid grid-cols-3 gap-2" data-pipeline>
          {stages.map((s, i) => (
            <li key={s.label} className="rounded-[4px] border border-rule-strong px-3.5 py-3" style={{ boxShadow: s.warn ? "inset 3px 0 0 var(--watch)" : undefined }}>
              <div className="flex items-baseline gap-2">
                <span className="num text-[11px] text-ink-dim">{i + 1}</span>
                <span className={`num text-[26px] leading-none font-semibold ${s.warn ? "text-watch" : "text-ink-bright"}`}>{s.n.toLocaleString("en-US")}</span>
              </div>
              <div className="mt-1.5 text-[13.5px] font-medium text-ink">{s.label}</div>
              <div className="text-[12px] text-ink-muted">{s.sub}</div>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-2 gap-6 rounded-[4px] border border-rule px-4 py-4">
          <Histogram title="Event confidence" bins={data.eventConfidence} threshold={data.reviewThreshold} unit={`${data.events} events`} />
          <Histogram title="OCR page confidence" bins={data.ocrPageConfidence} threshold={data.reviewThreshold} unit={`${data.ocrPages} pages`} />
        </div>
        <div className="rounded-[4px] border border-rule px-4 py-3.5">
          <h3 className="label-caps text-[10.5px] text-ink-muted">Checked against ground truth from the generator</h3>
          <div className="mt-3 grid grid-cols-5 gap-3">
            {[
              ["Found", a.recall],
              ["Type right", a.kindCorrect],
              ["Depth exact", a.depthExact],
              ["MW exact", a.mudWeightExact],
              ["NPT exact", a.nptExact],
            ].map(([k, v]) => (
              <div key={k as string}>
                <div className="num text-[20px] font-semibold text-ink-bright">{pct(v as number)}</div>
                <div className="text-[12px] text-ink-muted">{k}</div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[12.5px] leading-snug text-ink-muted">
            {missed} of {a.truthEvents} true events were missed, both on poor scans where OCR lost the incident heading. They are counted here, not hidden.
          </p>
        </div>
        <div className="rounded-[4px] border border-dashed border-rule-strong px-4 py-3.5" data-volve>
          <h3 className="label-caps text-[10.5px] text-ink-muted">Public-data proof · Equinor Volve</h3>
          {data.volve ? (
            <p className="mt-1.5 text-[13px] text-ink">
              Parsed {data.volve.parsed} of {data.volve.files} Volve daily reports, {data.volve.activities.toLocaleString("en-US")} activities.
            </p>
          ) : (
            <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">
              Not run in this build. The WITSML parser is written and tested on a fixture; the Volve reports need an Equinor data licence download first. Run{" "}
              <code className="num text-[12px] text-ink">data/volve/fetch.py</code> on them to fill this in.
            </p>
          )}
        </div>
      </section>
      <aside className="flex min-h-0 flex-col gap-3 bg-chrome px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between">
          <h2 className="label-caps text-[11px] text-ink-muted">Review queue</h2>
          <span className="text-[12px] text-ink-dim">{data.pendingReview} waiting · a person confirms before any alert</span>
        </div>
        <ol className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
          {queue.map((e) => (
            <ReviewCard key={e.id} e={e} onDecide={decide} />
          ))}
        </ol>
      </aside>
    </div>
  );
}
