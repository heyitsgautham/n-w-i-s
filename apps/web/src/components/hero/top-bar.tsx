"use client";

import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConsole } from "@/components/console/console-provider";
import { BRAND, TAGLINE } from "@/lib/brand";
import { clock, dayLabel, metres } from "@/lib/format";

function Readout({ label, value, unit, className = "" }: { label: string; value: string; unit?: string; className?: string }) {
  return (
    <div className={`shrink-0 ${className}`}>
      <div className="label-caps text-[10px] leading-none text-ink-dim">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1 leading-none">
        <span className="num truncate text-[19px] font-medium text-ink-bright">{value}</span>
        {unit && <span className="text-[12px] text-ink-muted">{unit}</span>}
      </div>
    </div>
  );
}

function Mark() {
  // A well bore through three strata, the product in one glyph.
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect x="1" y="4" width="24" height="5" style={{ fill: "var(--lith-sandstone)" }} opacity="0.85" />
      <rect x="1" y="10.5" width="24" height="5" style={{ fill: "var(--lith-shale)" }} opacity="0.85" />
      <rect x="1" y="17" width="24" height="5" style={{ fill: "var(--lith-limestone)" }} opacity="0.85" />
      <path d="M13 1 V21" style={{ stroke: "var(--bg)" }} strokeWidth="3" />
      <path d="M13 1 V20" style={{ stroke: "var(--ink-bright)" }} strokeWidth="1.4" />
      <path d="M10.5 19.5 H15.5 L13 23.5 Z" style={{ fill: "var(--ink-bright)" }} />
    </svg>
  );
}

export function TopBar() {
  const { model, scene, replay } = useConsole();
  const t = scene.telemetry;
  const here = scene.formationAtBit;
  const formation = model.formations.find((f) => f.id === here?.top.formationId);
  const nextFormation = model.formations.find((f) => f.id === here?.next?.formationId);
  const calledHere = scene.call !== null && here?.top.formationId === scene.call.message.topCall?.formationId && here?.top.status === "called";
  const note = calledHere
    ? `called ${clock(scene.call!.message.time).slice(0, 5)}`
    : here?.next && nextFormation
      ? `${nextFormation.short} ${here.next.status === "prognosed" ? "prog." : "at"} ${metres(here.next.md)} m`
      : "";
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-6 border-b border-rule bg-chrome px-4">
      <div className="flex shrink-0 items-center gap-2.5">
        <Mark />
        <div className="leading-none">
          <div className="text-[18px] font-bold tracking-[0.14em] text-ink-bright">{BRAND}</div>
          <div className="mt-1 text-[10.5px] tracking-[0.06em] text-ink-dim">{TAGLINE}</div>
        </div>
      </div>

      <div className="h-8 w-px shrink-0 bg-rule-strong" />

      <div className="shrink-0 leading-none">
        <div className="text-[19px] font-semibold text-ink-bright">{model.activeWellId}</div>
        <div className="mt-1.5 text-[11.5px] text-ink-muted">
          {model.field.name} · {model.replay.holeSizeIn} in section
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-5 xl:gap-7">
        <Readout label="Bit depth" value={metres(t.bitMd, 1)} unit="m MD" />
        <Readout label="ROP 10 min" value={t.ropAvg.toFixed(1)} unit="m/h" />
        <Readout label="WOB" value={t.wobTonnes.toFixed(1)} unit="t" className="hidden 2xl:block" />
        <Readout label="Flow" value={String(t.flowGpm)} unit="gpm" className="hidden 2xl:block" />
        <Readout label="MW in" value={t.mudWeightPpg.toFixed(1)} unit="ppg" />
        <div className="min-w-0">
          <div className="label-caps text-[10px] leading-none text-ink-dim">Formation at bit</div>
          <div className="mt-1.5 flex items-baseline gap-2 leading-none">
            <span className="truncate text-[17px] font-semibold text-ink-bright">{formation?.name ?? "n/a"}</span>
            <span className={`shrink-0 text-[12px] ${calledHere ? "text-ink-bright" : "text-ink-dim"}`}>{note}</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="text-right leading-none">
          <div className="num text-[19px] font-medium text-ink-bright">{clock(t.time)}</div>
          <div className="mt-1.5 text-[11px] text-ink-dim">IST · {dayLabel(t.time)}</div>
        </div>
        <div className="flex items-center gap-1.5 rounded-sm border border-rule-strong px-2 py-1">
          <span className="size-1.5 rounded-full bg-ink-bright" style={{ opacity: replay.playing ? (replay.tick % 2 === 0 ? 1 : 0.4) : 0.3 }} />
          <span className="label-caps text-[10px] text-ink-muted">Replay ×{model.replay.tickSeconds}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={replay.toggle}
            disabled={replay.atEnd}
            aria-label={replay.playing ? "Pause replay" : "Play replay"}
            data-control="play"
          >
            {replay.playing ? <Pause /> : <Play />}
            {replay.playing ? "Pause" : "Play"}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={replay.step}
            disabled={replay.atEnd}
            aria-label={`Step ${model.replay.tickSeconds} seconds`}
            data-control="step"
          >
            <StepForward />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={replay.reset} aria-label="Reset replay" data-control="reset">
            <RotateCcw />
          </Button>
        </div>
      </div>
    </header>
  );
}
