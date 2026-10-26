"use client";

import type { OffsetEvent } from "@wells/correlate";
import { Check, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useConsole } from "@/components/console/console-provider";
import { usePageImage } from "@/hooks/use-page-image";
import { API, fetchJson } from "@/lib/api";
import { dayLabel, metres } from "@/lib/format";
import { KIND_LABEL } from "@/lib/hazards";
import { Ingestion, ReviewQueue, type ReviewItem, type Volve } from "@/lib/schemas";

type Bin = Ingestion["eventConfidence"][number];

/** Volve report names run 15_9_19_BT2_1998_01_02: the wellbore, then the report date. */
function volveReport(name: string) {
  const m = /^(.*)_(\d{4})_(\d{2})_(\d{2})$/.exec(name);
  if (!m) return name;
  const well = `15/9-${m[1]!.replace(/^15_9_/, "").replaceAll("_", " ")}`;
  return `${well} · ${dayLabel(`${m[2]}-${m[3]}-${m[4]}`)}`;
}

function Accuracy({ a }: { a: Ingestion["accuracy"] }) {
  const fields: [string, number][] = [
    ["type", a.kindRight],
    ["depth", a.depthExact],
    ["mud weight", a.mudWeightExact],
    ["NPT", a.nptExact],
  ];
  const allExact = fields.every(([, n]) => n === a.found);
  return (
    <div className="rounded-[4px] border border-rule px-4 py-3.5" data-accuracy>
      <h3 className="label-caps text-[10.5px] text-ink-muted">Checked against the generator&apos;s ground truth</h3>
      <div className="mt-2.5 flex items-baseline gap-3">
        <span className="num text-[30px] leading-none font-semibold text-ink-bright">
          {a.found} <span className="text-ink-muted">of</span> {a.truthEvents}
        </span>
        <span className="text-[14px] text-ink">planted incidents found</span>
      </div>
      {allExact ? (
        <p className="mt-2 text-[13px] text-ink">
          On all {a.found} found, the{" "}
          {fields
            .map(([k]) => k)
            .join(", ")
            .replace(/, ([^,]*)$/, " and $1")}{" "}
          match the report exactly.
        </p>
      ) : (
        <ul className="mt-2 grid grid-cols-4 gap-3">
          {fields.map(([k, n]) => (
            <li key={k} className="text-[12.5px] text-ink-muted">
              <span className="num text-[16px] font-semibold text-ink-bright">
                {n}/{a.found}
              </span>{" "}
              {k} exact
            </li>
          ))}
        </ul>
      )}
      {a.missed.length > 0 && (
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-muted">
          Missed {a.missed.map((m) => m.id).join(" and ")}, {a.missed.every((m) => m.scanned) ? "both scanned pages where" : "where"} OCR misread the incident
          number, so the heading never parsed. They are counted here, not hidden.
        </p>
      )}
    </div>
  );
}

function VolveCard({ v }: { v: Volve | null }) {
  if (!v) {
    return (
      <div className="rounded-[4px] border border-dashed border-rule-strong px-4 py-3.5" data-volve>
        <h3 className="label-caps text-[10.5px] text-ink-muted">Real reports · Equinor Volve</h3>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">
          Run <code className="num text-[12px] text-ink">uv run python data/volve/fetch.py</code> to read Equinor&apos;s public Volve daily reports.
        </p>
      </div>
    );
  }
  const kinds = Object.entries(v.byKind);
  const max = Math.max(...kinds.map(([, n]) => n));
  const quote = v.examples["stuck-pipe"] ?? Object.values(v.examples)[0];
  const h = v.handCheck;
  return (
    <div className="rounded-[4px] border border-rule-strong px-4 py-3.5" style={{ boxShadow: "inset 3px 0 0 var(--ink-muted)" }} data-volve>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="label-caps text-[10.5px] text-ink-muted">Real reports · Equinor Volve field, North Sea</h3>
        <span className="text-[11px] text-ink-dim">Equinor Open Data Licence</span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-3" data-volve-counts>
        {[
          [v.reports, "daily reports"],
          [v.wells, "wells"],
          [v.activities, "activities read"],
          [v.hazardActivities, "hazards found"],
        ].map(([n, label]) => (
          <div key={label as string}>
            <div className="num text-[22px] leading-none font-semibold text-ink-bright">{(n as number).toLocaleString("en-US")}</div>
            <div className="mt-1 text-[12px] text-ink-muted">{label}</div>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-1" data-volve-kinds>
        {kinds.map(([k, n]) => (
          <li key={k} className="grid grid-cols-[118px_minmax(0,1fr)_36px] items-center gap-2 text-[12px]">
            <span className="text-ink-muted">{KIND_LABEL[k as keyof typeof KIND_LABEL] ?? k}</span>
            <span className="h-[7px] rounded-[1px] bg-ink-muted/60" style={{ width: `${(n / max) * 100}%` }} />
            <span className="num text-right text-ink">{n}</span>
          </li>
        ))}
      </ul>
      {quote && (
        <figure className="mt-3 rounded-[3px] border border-rule bg-[color-mix(in_srgb,var(--paper)_60%,transparent)] px-3 py-2" data-volve-quote>
          <blockquote className="num text-[12.5px] text-ink-bright">{quote.text}</blockquote>
          <figcaption className="mt-1 text-[11px] text-ink-dim">
            {volveReport(quote.report)} · {metres(quote.md)} m MD
          </figcaption>
        </figure>
      )}
      {h && (
        <p className="mt-2.5 text-[12.5px] leading-snug text-ink" data-volve-check>
          We read {h.sample} of the {v.hazardActivities} by hand, drawn at random. <span className="num font-semibold">{h.right}</span> named the right hazard,{" "}
          <span className="num">{h.otherHazard}</span> a different real hazard, and <span className="num">{h.notAHazard}</span> were not hazards.
        </p>
      )}
    </div>
  );
}

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
              <div
                className="w-full rounded-t-[2px]"
                style={{
                  height: Math.max(b.count ? 3 : 0, (b.count / max) * (h - 18)),
                  background: below ? "var(--watch)" : "var(--ink-muted)",
                  opacity: below ? 0.9 : 0.6,
                }}
              />
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
      <p className="mt-1.5 text-[11.5px] text-ink-dim">Amber bars fall under the {threshold.toFixed(2)} review threshold.</p>
    </div>
  );
}

export function PageCrop({ e }: { e: OffsetEvent }) {
  const src = `${API}/documents/${e.source.docId}/pages/${e.source.page}.png?scale=2`;
  const image = usePageImage(src);
  const b = e.source.bbox;
  if (!b) return null;
  const w = 360;
  const z = w / (b[2] - b[0] + 16);
  const h = (b[3] - b[1] + 12) * z;
  if (image === "missing") {
    return (
      <div
        className="flex items-center justify-center rounded-[2px] border border-dashed border-rule-strong px-4 text-center text-[12px] text-ink-muted"
        style={{ width: w, height: h }}
        data-page-missing
      >
        <span>
          Not rendered in this checkout. Run <code className="num text-ink">make data</code> to render it.
        </span>
      </div>
    );
  }
  return (
    <div
      className="rounded-[2px] border border-rule-strong bg-white"
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${src})`,
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
        <button
          type="button"
          onClick={() => openEvent(e)}
          className="flex min-w-0 items-center gap-1 text-left text-[14.5px] font-semibold text-ink-bright hover:underline"
        >
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
            <button
              type="button"
              onClick={() => onDecide(e.id, "confirm")}
              data-confirm={e.id}
              className="flex items-center gap-1.5 rounded-[3px] bg-ink-bright px-3 py-1.5 text-[13px] font-semibold text-[#0b0f19] hover:bg-ink"
            >
              <Check className="size-4" /> Confirm
            </button>
            <button
              type="button"
              onClick={() => onDecide(e.id, "reject")}
              className="flex items-center gap-1.5 rounded-[3px] border border-rule-strong px-3 py-1.5 text-[13px] text-ink-muted hover:text-ink"
            >
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
    Promise.all([fetchJson(`${API}/ingestion`, Ingestion), fetchJson(`${API}/review`, ReviewQueue)])
      .then(([i, q]) => {
        if (!live) return;
        setData(i);
        setQueue(q);
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
      <section className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-rule px-6 pt-5 pb-5" data-ingestion-scroll>
        <header>
          <div className="label-caps text-[10.5px] text-ink-dim">Ingestion</div>
          <h1 className="mt-1 text-[22px] leading-tight font-semibold text-ink-bright">Every daily report, parsed into events that cite their page</h1>
        </header>
        <ol className="grid grid-cols-3 gap-2" data-pipeline>
          {stages.map((s, i) => (
            <li
              key={s.label}
              className="rounded-[4px] border border-rule-strong px-3.5 py-3"
              style={{ boxShadow: s.warn ? "inset 3px 0 0 var(--watch)" : undefined }}
            >
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
        <Accuracy a={data.accuracy} />
        <VolveCard v={data.volve} />
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
