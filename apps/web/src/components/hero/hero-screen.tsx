"use client";

import { useConsole } from "@/components/console/console-provider";
import { CorrelationPanel } from "@/components/section/correlation-panel";
import type { HeroModel } from "@/lib/hero-model";
import { AlertList, RecommendationCard, RigFeed } from "./rail";

function Legend() {
  const item = "flex items-center gap-1.5 whitespace-nowrap";
  return (
    <div className="flex items-center gap-4 text-[11.5px] text-ink-muted" data-film-hide>
      <span className={item}>
        <svg width="22" height="8" aria-hidden>
          <line x1="0" x2="22" y1="4" y2="4" style={{ stroke: "var(--ink-bright)" }} strokeWidth="1.6" />
        </svg>
        Logged or called top
      </span>
      <span className={item}>
        <svg width="22" height="8" aria-hidden>
          <line x1="0" x2="22" y1="4" y2="4" style={{ stroke: "var(--ink)" }} strokeWidth="1.3" strokeDasharray="5 3" />
        </svg>
        Prognosed top
      </span>
      <span className={item}>
        <svg width="14" height="12" aria-hidden>
          <rect width="14" height="12" style={{ fill: "var(--lith-shale)" }} opacity="0.5" />
          <rect width="14" height="12" fill="url(#pat-prognosis)" opacity="0.7" />
        </svg>
        Ahead of the bit
      </span>
      <span className={item}>
        <svg width="14" height="12" aria-hidden>
          <rect width="14" height="12" style={{ fill: "var(--lith-sandstone)" }} opacity="0.55" />
          <rect width="14" height="12" fill="url(#pat-transit)" />
        </svg>
        Samples in transit
      </span>
      <span className={item}>
        <svg width="26" height="8" aria-hidden>
          <line x1="0" x2="26" y1="4" y2="4" style={{ stroke: "var(--watch)" }} strokeWidth="1.3" strokeDasharray="2 3" />
        </svg>
        Offset event projected by formation
      </span>
    </div>
  );
}

function TitleBlock({ model }: { model: HeroModel }) {
  const fault = model.faults[0];
  const cells: { k: string; v: string }[] = [
    { k: "Section", v: `A–A′ · ${model.wells.length} wells · horizontal not to scale` },
    { k: "Depth", v: `TVD below ${model.activeWellId} RT, ${model.datumRt} m AMSL` },
    { k: "Labels", v: "each well's own MD" },
    ...(fault ? [{ k: "Structure", v: `${fault.name} fault, ${fault.throwM} m down to E` }] : []),
    { k: "Pack", v: `synthetic, seed ${model.seed}` },
  ];
  return (
    <div className="flex shrink-0 border-t border-rule-strong" data-film-hide>
      {cells.map((c, i) => (
        <div key={c.k} className={`flex min-w-0 flex-auto items-baseline gap-2 px-3 py-1.5 ${i > 0 ? "border-l border-rule" : ""}`}>
          <span className="label-caps shrink-0 text-[9.5px] text-ink-dim">{c.k}</span>
          <span className="truncate text-[11.5px] text-ink-muted">{c.v}</span>
        </div>
      ))}
    </div>
  );
}

export function SectionScreen() {
  const { model, scene, openEvent } = useConsole();
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_clamp(372px,23vw,452px)]" data-section-grid>
      <section className="flex min-h-0 min-w-0 flex-col border-r border-rule">
        <div className="flex shrink-0 items-center justify-between gap-6 px-4 pt-3.5 pb-2.5">
          <h1 className="min-w-0 truncate text-[16px] leading-none font-semibold text-ink-bright">
            Correlation section A–A′
            <span className="ml-2.5 text-[12.5px] font-normal text-ink-muted">
              {model.activeWellId} and {model.wells.length - 1} offsets, west to east
            </span>
          </h1>
          <Legend />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3" data-section-panel>
          <CorrelationPanel model={model} scene={scene} onOpen={openEvent} />
        </div>
        <TitleBlock model={model} />
      </section>
      <aside className="flex min-h-0 flex-col gap-4 overflow-hidden bg-chrome px-4 pt-3.5 pb-3" data-film-rail>
        <AlertList model={model} scene={scene} onOpen={openEvent} />
        <RecommendationCard model={model} scene={scene} onOpen={openEvent} />
        <RigFeed model={model} scene={scene} />
      </aside>
    </div>
  );
}
