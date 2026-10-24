"use client";

import type { OffsetEvent } from "@wells/correlate";
import { ArrowDown, ArrowUp, CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useConsole } from "@/components/console/console-provider";
import { API } from "@/lib/api";
import { dayLabel, metres } from "@/lib/format";

interface Result extends OffsetEvent {
  formationId: string | null;
  distanceKm: number;
  score: number;
}

interface Response {
  query: string;
  filters: { key: "kind" | "formation" | "radius" | "yearFrom" | "yearTo"; value: string | number }[];
  terms: string[];
  count: number;
  results: Result[];
}

const KIND_LABEL: Record<string, string> = {
  losses: "Losses",
  "stuck-pipe": "Stuck pipe",
  "differential-sticking": "Differential sticking",
  caving: "Caving",
  kick: "Kick",
  "tight-hole": "Tight hole",
  "bit-balling": "Bit balling",
};

const SUGGESTIONS = ["losses in Tipam within 5 km since 2015", "stuck pipe in Barail coal-shale", "kicks in Kopili within 8 km", "tight hole in Girujan before 2014"];

type SortKey = "date" | "md" | "lossRateBblH" | "mudWeightPpg" | "nptHours" | "distanceKm";

const COLUMNS: { key: SortKey | null; label: string; align?: "right" }[] = [
  { key: null, label: "Well" },
  { key: "date", label: "Date" },
  { key: null, label: "Event" },
  { key: null, label: "Formation" },
  { key: "md", label: "Depth m", align: "right" },
  { key: "lossRateBblH", label: "Loss bbl/h", align: "right" },
  { key: "mudWeightPpg", label: "MW ppg", align: "right" },
  { key: "nptHours", label: "NPT h", align: "right" },
  { key: "distanceKm", label: "km", align: "right" },
  { key: null, label: "Source" },
];

function Mark({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="rounded-[2px] bg-[rgba(251,191,36,0.25)] px-0.5 text-ink-bright">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function SearchScreen({ initialQuery }: { initialQuery: string }) {
  const { model, openEvent } = useConsole();
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    let live = true;
    fetch(`${API}/search?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`))))
      .then((d: Response) => {
        if (!live) return;
        setData(d);
        setError(null);
        setSort(null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [query]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (!sort) return data.results;
    return [...data.results].sort((a, b) => {
      const va = a[sort.key] ?? -Infinity;
      const vb = b[sort.key] ?? -Infinity;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [data, sort]);

  const formationName = (id: string | null) => model.formations.find((f) => f.id === id)?.name ?? "n/a";
  const chip = (f: Response["filters"][number]) =>
    f.key === "kind"
      ? `Event: ${KIND_LABEL[f.value as string]?.toLowerCase()}`
      : f.key === "formation"
        ? `Formation: ${formationName(f.value as string)}`
        : f.key === "radius"
          ? `Within ${f.value} km of ${model.activeWellId}`
          : f.key === "yearFrom"
            ? `From ${f.value}`
            : `To ${f.value}`;
  const pages = data ? new Set(data.results.map((r) => `${r.source.docId}#${r.source.page}`)).size : 0;
  const highlight = data ? [...data.terms, ...data.filters.filter((f) => f.key === "kind").flatMap((f) => (f.value === "losses" ? ["losses", "loss"] : []))] : [];

  return (
    <div className="flex h-full min-h-0 flex-col px-6 pt-5 pb-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(draft);
        }}
        className="flex shrink-0 items-center gap-3 rounded-[4px] border border-rule-strong bg-paper px-4 py-3 focus-within:border-ink-muted"
      >
        <Search className="size-5 shrink-0 text-ink-muted" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask the offset reports, e.g. losses in Tipam within 5 km since 2015"
          aria-label="Question"
          maxLength={200}
          data-search-input
          className="min-w-0 flex-1 bg-transparent text-[20px] text-ink-bright outline-none placeholder:text-ink-dim"
        />
        <button type="submit" data-search-submit className="flex items-center gap-1.5 rounded-[3px] border border-rule-strong px-2.5 py-1.5 text-[12px] text-ink-muted hover:text-ink">
          Search <CornerDownLeft className="size-3.5" />
        </button>
      </form>

      {!data && !error && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="label-caps text-[10px] text-ink-dim">Try</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              data-try={s}
              onClick={() => {
                setDraft(s);
                setQuery(s);
              }}
              className="rounded-[3px] border border-rule-strong px-2.5 py-1 text-[13px] text-ink-muted hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-5 text-[14px] text-prepare">The API is not answering ({error}). Start it with `pnpm dev`.</p>}

      {data && (
        <>
          <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
            <span className="label-caps mr-1 text-[10px] text-ink-dim">Read as</span>
            {data.filters.map((f) => (
              <span key={`${f.key}-${f.value}`} className="rounded-[3px] border border-ink-muted/50 bg-accent px-2.5 py-1 text-[13px] text-ink-bright" data-filter={f.key}>
                {chip(f)}
              </span>
            ))}
            {data.terms.length > 0 && <span className="text-[13px] text-ink-muted">ranked by “{data.terms.join(" ")}”</span>}
          </div>
          <div className="mt-4 flex shrink-0 items-baseline gap-3">
            <span className="num text-[28px] leading-none font-semibold text-ink-bright" data-count={data.count}>
              {data.count}
            </span>
            <span className="text-[14px] text-ink-muted">
              {data.count === 1 ? "event" : "events"}, each on its report page · {pages} {pages === 1 ? "page" : "pages"} cited
            </span>
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-[4px] border border-rule">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-chrome">
                <tr className="border-b border-rule-strong">
                  {COLUMNS.map((c) => (
                    <th key={c.label} className={`px-3 py-2.5 ${c.align === "right" ? "text-right" : ""}`}>
                      {c.key ? (
                        <button
                          type="button"
                          data-sort={c.key}
                          onClick={() => setSort((s) => ({ key: c.key!, dir: s?.key === c.key && s.dir === -1 ? 1 : -1 }))}
                          className={`label-caps inline-flex items-center gap-1 text-[10.5px] hover:text-ink ${sort?.key === c.key ? "text-ink-bright" : "text-ink-dim"}`}
                        >
                          {c.label}
                          {sort?.key === c.key && (sort.dir === -1 ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                        </button>
                      ) : (
                        <span className="label-caps text-[10.5px] text-ink-dim">{c.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openEvent(r)}
                    data-result={r.id}
                    className="cursor-pointer border-b border-rule align-top transition-colors hover:bg-accent"
                  >
                    <td className="px-3 py-3 text-[15px] font-semibold text-ink-bright">{r.wellId}</td>
                    <td className="num px-3 py-3 text-[13px] whitespace-nowrap text-ink">{dayLabel(r.date)}</td>
                    <td className="max-w-[420px] px-3 py-3">
                      <div className="text-[14px] font-medium text-ink-bright">{r.title}</div>
                      <div className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
                        <Mark text={r.narrative} words={highlight} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[13px] text-ink">{formationName(r.formationId)}</td>
                    <td className="num px-3 py-3 text-right text-[14px] text-ink-bright">{metres(r.md, 1)}</td>
                    <td className="num px-3 py-3 text-right text-[14px] text-ink-bright">{r.lossRateBblH ?? ""}</td>
                    <td className="num px-3 py-3 text-right text-[14px] text-ink-bright">{r.mudWeightPpg.toFixed(1)}</td>
                    <td className="num px-3 py-3 text-right text-[14px] text-ink">{r.nptHours.toFixed(1)}</td>
                    <td className="num px-3 py-3 text-right text-[14px] text-ink">{r.distanceKm.toFixed(1)}</td>
                    <td className="px-3 py-3">
                      <div className="num text-[12.5px] whitespace-nowrap text-ink-muted underline decoration-ink-faint underline-offset-2">
                        DDR {r.source.docId.slice(7)} p.{r.source.page}
                      </div>
                      <div className="mt-0.5 text-[11.5px] whitespace-nowrap text-ink-dim">
                        {r.source.ocr ? "OCR" : "text"} · {r.confidence.toFixed(2)}
                        {r.needsReview && <span className="ml-1.5 text-watch">review</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="px-4 py-6 text-[14px] text-ink-muted">Nothing in the parsed reports matches that.</p>}
          </div>
        </>
      )}
    </div>
  );
}
