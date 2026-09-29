"use client";

import { formatHours, formationAtMd, intervalOf, type OffsetEvent } from "@wells/correlate";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useConsole } from "@/components/console/console-provider";
import { BAND_COLOR } from "@/components/section/annotations";
import { API } from "@/lib/api";
import { dayLabel, metres } from "@/lib/format";

const A4 = { w: 595.28, h: 841.89 };
const LESSON_LABEL = { "raise-mud-weight": "Mud weight", "wiper-trip": "Wiper trip", "limit-static-time": "Static time" } as const;

function Field({ label, value, unit, wide }: { label: string; value: string; unit?: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="label-caps text-[9.5px] text-ink-dim">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="num text-[15px] text-ink-bright">{value}</span>
        {unit && <span className="text-[11.5px] text-ink-muted">{unit}</span>}
      </div>
    </div>
  );
}

function Marked({ text, mark }: { text: string; mark: string | undefined }) {
  const at = mark ? text.indexOf(mark) : -1;
  if (!mark || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[2px] bg-[rgba(250,204,21,0.28)] px-0.5 text-ink-bright">{mark}</mark>
      {text.slice(at + mark.length)}
    </>
  );
}

function Prose({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-caps text-[9.5px] text-ink-dim">{label}</div>
      <p className="mt-1 text-[13.5px] leading-snug text-ink">{children}</p>
    </div>
  );
}

/** The sentence the recommendation rests on: the first lesson that points at a place on this page. */
function evidenceOf(event: OffsetEvent) {
  const lesson = event.lessons.find((l) => l.source && l.source.page === event.source.page);
  return lesson ? { text: lesson.evidence, rects: lesson.source!.rects } : undefined;
}

/** Tesseract's words for a page, line by line from the top, in PDF points: text, x0, top, x1, bottom. */
interface PageWords {
  ocr: boolean;
  lines: { conf: number; words: [string, number, number, number, number][] }[];
}

/** How long the scan line takes to run down the whole page, and when the highlight follows it. */
const SWEEP_MS = 2600;
const MARK_AFTER_MS = SWEEP_MS + 150;

function OcrLayer({ words, k }: { words: PageWords; k: number }) {
  const at = (top: number) => Math.round((top / A4.h) * SWEEP_MS);
  return (
    <div className="pointer-events-none absolute inset-0" data-ocr-layer>
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        data-ocr-sweep
        style={
          {
            "--sweep-to": `${A4.h * k}px`,
            background: "var(--ocr)",
            boxShadow: "0 0 14px 4px color-mix(in srgb, var(--ocr) 55%, transparent)",
            animation: `ocr-sweep ${SWEEP_MS}ms linear both`,
          } as React.CSSProperties
        }
      />
      {words.lines.map((line, i) =>
        line.words.map(([text, x0, top, x1, bottom], j) => (
          <div
            key={`${i}-${j}`}
            title={text}
            className="absolute rounded-[1px]"
            style={{
              left: x0 * k - 1,
              top: top * k - 1,
              width: (x1 - x0) * k + 2,
              height: (bottom - top) * k + 2,
              border: "1px solid color-mix(in srgb, var(--ocr) 85%, transparent)",
              animation: `ocr-word 700ms ease-out ${at(top)}ms both`,
            }}
          />
        )),
      )}
    </div>
  );
}

function PageViewer({ event }: { event: OffsetEvent }) {
  const evidence = evidenceOf(event);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [words, setWords] = useState<PageWords | null>(null);
  const page = event.source.page ?? 1;
  const src = `${API}/documents/${event.source.docId}/pages/${page}.png?scale=2`;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!event.source.ocr) return;
    let live = true;
    fetch(`${API}/documents/${event.source.docId}/pages/${page}/words`)
      .then((r) => r.json())
      .then((w: PageWords) => live && setWords(w))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [event.source.docId, event.source.ocr, page]);
  const k = width / A4.w;
  const b = event.source.bbox;
  useEffect(() => {
    if (loaded !== src || !b || !box.current) return;
    box.current.scrollTop = Math.max(0, b[1] * k - box.current.clientHeight * 0.3);
  }, [loaded, src, b, k]);
  // On a scanned page the highlight waits for the scan line to pass, so the page is read before it is marked.
  const ready = loaded === src && (!event.source.ocr || words !== null);
  const mark = event.source.ocr ? { animation: `appear 350ms ease-out ${MARK_AFTER_MS}ms both` } : undefined;
  const wordCount = words?.lines.reduce((n, l) => n + l.words.length, 0) ?? 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[3px] border border-rule-strong bg-[#d9dcd8]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-rule-strong bg-paper px-3 py-2">
        <span className="num truncate text-[12px] text-ink">
          DDR {event.source.docId} · page {page}
          <span className="ml-2 font-sans text-ink-muted" data-page-caption>
            {event.source.ocr ? `· scanned page, ${wordCount || "…"} words read by OCR` : evidence ? "· highlighted: the sentence behind the lesson" : ""}
          </span>
        </span>
        <a
          href={`${API}/documents/${event.source.docId}.pdf`}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 text-[12px] text-ink-muted hover:text-ink"
        >
          Open PDF <ExternalLink className="size-3.5" />
        </a>
      </div>
      <div ref={box} className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-page-viewer>
        {width > 0 && (
          <div className="relative" style={{ width, height: A4.h * k }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API, sized by the page box */}
            <img src={src} alt={`Report page ${page}`} width={width} height={A4.h * k} onLoad={() => setLoaded(src)} className="block" />
            {ready && words && <OcrLayer words={words} k={k} />}
            {ready && b && (
              <div
                className="pointer-events-none absolute rounded-[2px]"
                data-highlight
                style={{
                  left: b[0] * k - 6,
                  top: b[1] * k - 5,
                  width: (b[2] - b[0]) * k + 12,
                  height: (b[3] - b[1]) * k + 10,
                  background: evidence ? "rgba(251, 191, 36, 0.06)" : "rgba(251, 191, 36, 0.22)",
                  boxShadow: "0 0 0 2px rgba(217, 119, 6, 0.95)",
                  mixBlendMode: "multiply",
                  ...mark,
                }}
              />
            )}
            {ready &&
              evidence?.rects.map((r, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute rounded-[1px]"
                  data-sentence={i}
                  style={{
                    left: r[0] * k - 2,
                    top: r[1] * k - 2,
                    width: (r[2] - r[0]) * k + 4,
                    height: (r[3] - r[1]) * k + 4,
                    background: "rgba(250, 204, 21, 0.62)",
                    mixBlendMode: "multiply",
                    ...mark,
                  }}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EventDrawer() {
  const { drawer, closeDrawer, model, scene } = useConsole();
  // Keep the last event on screen while the drawer slides out.
  const [shown, setShown] = useState<typeof drawer>(null);
  if (drawer && drawer !== shown) setShown(drawer);
  const open = drawer !== null;
  const target = drawer ?? shown;
  const e = target?.event;
  const well = e ? model.wellIndex.find((w) => w.id === e.wellId) : undefined;
  const formationId = e && well ? formationAtMd(well.tops, e.md) : undefined;
  const formation = model.formations.find((f) => f.id === formationId);
  const below = e && well && formationId ? e.md - intervalOf(well.tops, formationId).top : undefined;
  const a = target?.alert;

  return (
    <div
      className={`fixed inset-x-0 top-[60px] bottom-7 z-40 transition-[visibility] duration-300 ${open ? "visible" : "invisible"}`}
      aria-hidden={!open}
    >
      <div className={`absolute inset-0 bg-[#01040b]/60 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={closeDrawer} />
      <aside
        role="dialog"
        aria-label="Offset event"
        data-drawer={open ? "open" : "closed"}
        className={`absolute inset-y-0 right-0 flex w-[min(1180px,74vw)] flex-col border-l border-rule-strong bg-chrome shadow-[-24px_0_48px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {e && well && (
          <>
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-rule px-5 pt-4 pb-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  {a && (
                    <span
                      className="num flex size-[24px] items-center justify-center rounded-full text-[12.5px] font-semibold text-[#0b0f19]"
                      style={{ background: BAND_COLOR[a.band] }}
                    >
                      {a.n}
                    </span>
                  )}
                  <h2 className="truncate text-[20px] font-semibold text-ink-bright">{e.title}</h2>
                </div>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {e.wellId} · {well.distanceKm} km {well.bearing} · spud {well.spudDate.slice(0, 4)} · {well.rig} · {dayLabel(e.date)}
                </p>
              </div>
              <button type="button" onClick={closeDrawer} aria-label="Close" className="rounded-[3px] p-1.5 text-ink-muted hover:bg-accent hover:text-ink">
                <X className="size-5" />
              </button>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)] gap-5 px-5 py-4">
              <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                {a && (
                  <div className="rounded-[3px] px-3 py-2.5" style={{ background: `color-mix(in srgb, ${BAND_COLOR[a.band]} 10%, transparent)`, boxShadow: `inset 3px 0 0 ${BAND_COLOR[a.band]}` }}>
                    <div className="label-caps text-[9.5px] text-ink-muted">On {model.activeWellId}, placed by formation</div>
                    <div className="num mt-1 text-[15px] text-ink-bright">
                      {metres(a.projection.md)} m · <span style={{ color: BAND_COLOR[a.band] }}>{a.hours === null ? "passed" : formatHours(a.hours)}</span> at{" "}
                      {scene.telemetry.ropAvg.toFixed(1)} m/h
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Depth" value={metres(e.md, 1)} unit="m MD" />
                  <Field label="Mud weight" value={e.mudWeightPpg.toFixed(1)} unit="ppg" />
                  <Field label="NPT" value={e.nptHours.toFixed(1)} unit="h" />
                  {e.lossRateBblH !== undefined ? (
                    <Field label="Loss rate" value={String(e.lossRateBblH)} unit="bbl/h" />
                  ) : (
                    <Field label="Started" value={(e as OffsetEvent & { time?: string | null }).time ?? "n/a"} unit="h" />
                  )}
                  {formation && below !== undefined && <Field label="Formation" value={`${formation.name}, ${metres(below)} m below top`} wide />}
                </div>
                <Prose label="What happened">{e.narrative}</Prose>
                <Prose label="What they did">{e.action}</Prose>
                {e.remarks && (
                  <Prose label="Remarks">
                    <Marked text={e.remarks} mark={evidenceOf(e)?.text} />
                  </Prose>
                )}
                {e.lessons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-lessons>
                    {e.lessons.map((l) => (
                      <span key={l.kind} className="label-caps rounded-[2px] border border-rule-strong px-1.5 py-1 text-[9.5px] text-ink-muted">
                        Lesson · {LESSON_LABEL[l.kind]}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto rounded-[3px] border border-rule-strong px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="label-caps text-[9.5px] text-ink-dim">Extraction confidence</span>
                    <span className="num text-[16px] font-semibold text-ink-bright" data-confidence>
                      {e.confidence.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule">
                    <div className="h-full bg-ink-muted" style={{ width: `${e.confidence * 100}%` }} />
                  </div>
                  <p className="mt-2 text-[12px] text-ink-muted">
                    {e.source.ocr ? "Read by OCR from a scanned page." : "Read from the page's text layer."}{" "}
                    {e.needsReview ? "Waiting for review, so it cannot raise an alert yet." : "Cleared to raise alerts."}
                  </p>
                </div>
              </div>
              <PageViewer key={`${e.source.docId}-${e.source.page}`} event={e} />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
