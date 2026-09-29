"use client";

import { formatHours, type Band, type Formation, type OffsetEvent } from "@wells/correlate";
import { BAND_COLOR } from "@/components/section/annotations";
import { clock, dayLabel, metres } from "@/lib/format";
import type { HeroModel } from "@/lib/hero-model";
import { RETIE_DELAY_MS, RETIE_MS, type NumberedAlert, type Scene } from "@/lib/scene";
import { BRAND } from "@/lib/brand";

const BAND_LABEL: Record<Band, string> = { prepare: "Prepare", watch: "Watch", monitor: "Monitor", passed: "Passed" };

function BandChip({ band }: { band: Band }) {
  const solid = band === "prepare" || band === "watch";
  return (
    <span
      className="label-caps inline-flex h-[18px] items-center rounded-[2px] px-1.5 text-[9.5px] transition-colors duration-300"
      style={{
        background: solid ? BAND_COLOR[band] : "transparent",
        color: solid ? "#0b0f19" : BAND_COLOR[band],
        boxShadow: solid ? undefined : `inset 0 0 0 1px ${BAND_COLOR[band]}`,
      }}
    >
      {BAND_LABEL[band]}
    </span>
  );
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="label-caps text-[11px] text-ink-muted">{children}</h2>
      {aside && <div className="text-[11px] text-ink-dim">{aside}</div>}
    </div>
  );
}

function AlertRow({ a, model, settled, onOpen }: { a: NumberedAlert; model: HeroModel; settled: boolean; onOpen: (e: OffsetEvent) => void }) {
  const formation = model.formations.find((f) => f.id === a.projection.formationId);
  const flipped = settled && a.band !== a.bandBefore;
  const moved = Math.abs(a.mdBefore - a.projection.md) >= 1;
  const color = BAND_COLOR[a.band];
  const solid = a.band === "prepare" || a.band === "watch";
  return (
    <li
      role="button"
      tabIndex={0}
      data-alert={a.n}
      onClick={() => onOpen(a.event)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(a.event)}
      className="grid cursor-pointer grid-cols-[22px_minmax(0,1fr)] gap-x-2.5 rounded-[3px] py-2 pr-3 pl-2.5 outline-none transition-[filter] hover:brightness-125 focus-visible:ring-1 focus-visible:ring-ink-muted"
      style={{
        background: `color-mix(in srgb, ${color} 7%, transparent)`,
        boxShadow: `inset 3px 0 0 ${color}`,
        animation: flipped && a.band === "prepare" ? "flip-flash 1.4s ease-out" : undefined,
      }}
    >
      <span
        className="num mt-px flex size-[22px] items-center justify-center rounded-full text-[12px] font-semibold"
        style={{ background: solid ? color : "transparent", color: solid ? "#0b0f19" : color, boxShadow: `inset 0 0 0 1.5px ${color}` }}
      >
        {a.n}
      </span>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[14.5px] leading-tight font-semibold text-ink-bright">{a.event.title}</span>
          <BandChip band={a.band} />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="num text-[19px] leading-none font-semibold" style={{ color }}>
            {a.hours === null ? "passed" : formatHours(a.hours)}
          </span>
          <span className="num truncate text-[11.5px] text-ink-muted">
            {metres(a.projection.md)} m · {metres(a.aheadM)} m ahead
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2 text-[11.5px] leading-tight">
          <span className="truncate text-ink-muted" data-film-hide>
            <span className="text-ink">
              {metres(a.projection.offsetM)} m {a.projection.anchor === "top" ? "below" : "above"} {formation?.short}{" "}
              {a.projection.anchor}
            </span>
            {" · "}
            {a.event.wellId} · NPT {a.event.nptHours} h
          </span>
          {settled && moved && a.hoursBefore !== null && (
            <span className="num shrink-0 text-ink-dim line-through decoration-ink-dim/70">{formatHours(a.hoursBefore)}</span>
          )}
        </div>
      </div>
    </li>
  );
}

export function AlertList({ model, scene, onOpen }: { model: HeroModel; scene: Scene; onOpen: (e: OffsetEvent) => void }) {
  const settled = scene.call !== null && (scene.call.elapsedMs === null || scene.call.elapsedMs >= RETIE_DELAY_MS + RETIE_MS);
  const next = scene.deeper[0];
  const nextFormation = next && model.formations.find((f) => f.id === next.projection.formationId);
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle aside={`Prepare ≤ ${model.bands.prepareHours} h · Watch ≤ ${model.bands.watchHours} h`}>
        Ahead of the bit
      </SectionTitle>
      <p className="-mt-1 truncate text-[12px] text-ink-dim" data-film-hide>
        Placed on {model.activeWellId} by formation · at the 10-min ROP,{" "}
        <span className="num text-ink-muted">{scene.telemetry.ropAvg.toFixed(1)} m/h</span>
      </p>
      <ol className="flex flex-col gap-1.5">
        {scene.alerts.map((a) => (
          <AlertRow key={`${a.event.id}-${a.band}`} a={a} model={model} settled={settled} onOpen={onOpen} />
        ))}
      </ol>
      {next && (
        <p className="truncate text-[12px] text-ink-dim" data-film-hide>
          +{scene.deeper.length} deeper · next {next.event.title.toLowerCase()} in {nextFormation?.short},{" "}
          <span className="num">{next.hours === null ? "" : formatHours(next.hours)}</span>
        </p>
      )}
    </section>
  );
}

export function RecommendationCard({ model, scene, onOpen }: { model: HeroModel; scene: Scene; onOpen: (e: OffsetEvent) => void }) {
  const rec = scene.recommendation;
  if (!rec) return null;
  const lead = rec.lead;
  const color = BAND_COLOR[lead.band];
  const sources = [...new Set(rec.lines.map((l) => l.eventId))]
    .map((id) => model.events.find((e) => e.id === id))
    .filter((e) => e !== undefined);
  return (
    <section
      data-recommendation
      className="rounded-[3px] border border-rule-strong bg-[color-mix(in_srgb,var(--paper)_70%,transparent)]"
      style={{ boxShadow: `inset 0 2px 0 ${color}` }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-rule px-3.5 pt-3 pb-2.5">
        <div className="min-w-0">
          <div className="label-caps text-[10.5px] text-ink-muted">Recommended from the offsets</div>
          <div className="mt-1 text-[15px] font-semibold text-ink-bright">
            Before <span className="num">{metres(lead.projection.md)} m</span>
            <span className="mx-1.5 text-ink-dim">·</span>
            <span className="num" style={{ color }}>
              {lead.hours === null ? "" : formatHours(lead.hours)}
            </span>
          </div>
        </div>
        <BandChip band={lead.band} />
      </div>
      <ol className="flex flex-col gap-2 px-3.5 py-2.5">
        {rec.lines.map((l, i) => (
          <li key={l.kind} className="grid grid-cols-[16px_1fr] gap-x-2" data-rec-line={i}>
            <span className="num pt-px text-[12px] text-ink-dim">{i + 1}</span>
            <div>
              <div className="text-[13.5px] leading-snug font-medium text-ink-bright">{l.text}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-ink-muted [@media(max-height:960px)]:hidden">{l.evidence}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex items-baseline gap-2 overflow-hidden border-t border-rule px-3.5 py-2 whitespace-nowrap">
        <span className="label-caps shrink-0 text-[9.5px] text-ink-dim">Sources</span>
        <span className="truncate text-[11.5px] text-ink-muted">
          {sources.map((e, i) => (
            <span key={e.id}>
              {i > 0 && <span className="mx-1.5 text-ink-faint">·</span>}
              <button type="button" onClick={() => onOpen(e)} className="cursor-pointer underline decoration-ink-faint underline-offset-2 hover:text-ink">
                {e.wellId} DDR {dayLabel(e.date)}, p.{e.source.page}
              </button>
            </span>
          ))}
        </span>
      </div>
    </section>
  );
}

const SOURCE_LABEL = { driller: "Driller", "mud-logger": "Mud logger", system: BRAND } as const;

export function RigFeed({ model, scene }: { model: HeroModel; scene: Scene }) {
  const call = scene.call;
  const settled = call && (call.elapsedMs === null || call.elapsedMs >= RETIE_DELAY_MS + RETIE_MS);
  const formations = new Map<string, Formation>(model.formations.map((f) => [f.id, f]));
  const items: { key: string; time: string; source: keyof typeof SOURCE_LABEL; text: string; hot?: boolean; fresh?: boolean }[] =
    scene.messages.map((m) => ({
      key: `${m.tick}-${m.source}`,
      time: m.time,
      source: m.source,
      text: m.text,
      hot: m.topCall !== undefined,
      fresh: m.tick === scene.telemetry.tick,
    }));
  if (call && settled) {
    const f = formations.get(call.message.topCall!.formationId);
    const flipText = call.flips.map((a) => `Alert ${a.n} is now ${BAND_LABEL[a.band].toUpperCase()}, ${a.hours === null ? "" : formatHours(a.hours)}.`).join(" ");
    items.push({
      key: "retie",
      time: call.message.time,
      source: "system",
      text: `Re-tied ${model.activeWellId} on the ${f?.name} call. Tops below moved ${metres(Math.abs(call.shiftM))} m ${call.shiftM < 0 ? "shallower" : "deeper"}, and every alert below moved with them. ${flipText}`,
      fresh: call.elapsedMs !== null,
    });
  }
  const ordered = items.reverse();
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <SectionTitle aside={`${model.replay.lagMinutes} min lag to shakers`}>Rig floor</SectionTitle>
      <ol className="flex min-h-0 flex-col gap-1 overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
        {ordered.map((m) => (
          <li
            key={m.key}
            data-feed={m.source}
            className="grid grid-cols-[62px_1fr] gap-x-2 rounded-[3px] px-2 py-1.5"
            style={{
              background: m.source === "system" ? "color-mix(in srgb, var(--ink) 6%, transparent)" : undefined,
              boxShadow: m.hot ? "inset 2px 0 0 var(--ink-bright)" : m.source === "system" ? "inset 2px 0 0 var(--ink-muted)" : undefined,
              animation: m.fresh ? "feed-in 420ms ease-out" : undefined,
            }}
          >
            <span className="num pt-px text-[11.5px] text-ink-dim">{clock(m.time)}</span>
            <div className="min-w-0 leading-snug">
              <span className={`label-caps mr-1.5 text-[9.5px] ${m.hot || m.source === "system" ? "text-ink-bright" : "text-ink-dim"}`}>
                {SOURCE_LABEL[m.source]}
              </span>
              <span className={`text-[13px] leading-snug ${m.hot ? "font-medium text-ink-bright" : "text-ink"}`}>{m.text}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
