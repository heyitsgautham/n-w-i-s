import { LithologyPatterns } from "@/components/section/patterns";
import { loadField, loadStats } from "@/lib/data";

/** The closing card, and a plain statement of what is real in this prototype and what is not. */
export default function AboutPage() {
  const field = loadField();
  const stats = loadStats();
  const offsets = field.wells.filter((w) => w.role === "offset").length;
  return (
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden px-[6vw]" data-title-card>
      {/* The product in one mark: a well bore through the column, drawn like the section's own tracks. */}
      <svg className="mr-[5vw] shrink-0" width="56" height="560" viewBox="0 0 56 560" aria-hidden>
        <LithologyPatterns />
        {(
          [
            ["gravel", 0, 40],
            ["sandy-clay", 40, 110],
            ["clay", 110, 200],
            ["sandstone", 200, 330],
            ["shale", 330, 400],
            ["coal", 352, 357],
            ["coal", 378, 382],
            ["sandstone", 400, 450],
            ["shale", 450, 500],
            ["limestone", 500, 560],
          ] as const
        ).map(([l, a, b], i) => (
          <g key={i}>
            <rect x="8" y={a} width="40" height={b - a} style={{ fill: `var(--lith-${l})` }} opacity={0.85} />
            {l !== "coal" && <rect x="8" y={a} width="40" height={b - a} fill={`url(#pat-${l})`} />}
          </g>
        ))}
        <rect x="8" y="0" width="40" height="560" fill="none" style={{ stroke: "var(--ink-muted)" }} />
        <path d="M28 0 V372" style={{ stroke: "var(--bg)" }} strokeWidth="5" />
        <path d="M28 0 V368" style={{ stroke: "var(--ink-bright)" }} strokeWidth="2" />
        <path d="M20 362 H36 L28 376 Z" style={{ fill: "var(--ink-bright)" }} />
      </svg>
      <div className="relative max-w-[980px]">
        <div className="label-caps text-[13px] text-ink-muted">Oil India Limited</div>
        <h1 className="mt-4 text-[88px] leading-[0.9] font-bold tracking-[0.04em] text-ink-bright">N-W-I-S</h1>
        <p className="mt-3 text-[30px] leading-tight text-ink">Offset-well memory</p>
        <p className="mt-2 max-w-[760px] text-[19px] leading-snug text-ink-muted">
          Offset-well memory for the active well. Alerts live on formations, re-tie when a top comes in off prognosis, and open the report page they came from.
        </p>
        <div className="mt-8 inline-flex items-center gap-3 rounded-[4px] border border-ink-muted/50 px-4 py-2.5">
          <span className="size-2 rounded-full bg-watch" />
          <span className="text-[17px] font-semibold text-ink-bright">Target product · working prototype · synthetic data</span>
        </div>
        <ul className="mt-7 grid max-w-[900px] grid-cols-2 gap-x-10 gap-y-2 text-[15px] text-ink">
          <li>Runs for real: correlation, re-tie, ETA, search, briefing export</li>
          <li>
            Parser run on {stats.documents} rendered reports, {stats.ocrPages} pages by OCR
          </li>
          <li>
            Synthetic: {field.field.name} field, {offsets} offsets and KN-125, all fictional
          </li>
          <li>Not run yet: Equinor Volve reports; not deployed at OIL</li>
        </ul>
        <div className="mt-10 flex items-baseline gap-8 border-t border-rule pt-5">
          <div>
            <div className="label-caps text-[11px] text-ink-dim">Team</div>
            <div className="mt-1 text-[17px] text-ink-bright">Team 1 · Saveetha Engineering College</div>
          </div>
          <div>
            <div className="label-caps text-[11px] text-ink-dim">Code</div>
            <div className="num mt-1 text-[16px] text-ink-bright">github.com/heyitsgautham/n-w-i-s</div>
          </div>
        </div>
      </div>
    </div>
  );
}
