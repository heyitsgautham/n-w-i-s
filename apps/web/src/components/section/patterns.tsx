import type { Lithology } from "@wells/correlate";

export const lithFill = (l: Lithology) => `var(--lith-${l})`;
export const lithPattern = (l: Lithology) => (l === "coal" ? undefined : `url(#pat-${l})`);

const ink = { stroke: "var(--pattern-ink)", fill: "none" } as const;
const dot = { fill: "var(--pattern-ink)" } as const;

/**
 * FGDC-style lithology symbols, drawn in dark ink over the colour fill the way a printed
 * section is. Coal has no symbol; its near-black fill is the symbol.
 */
export function LithologyPatterns() {
  return (
    <defs>
      <pattern id="pat-sandstone" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="0.75" style={dot} opacity="0.55" />
        <circle cx="4.5" cy="4.5" r="0.75" style={dot} opacity="0.55" />
      </pattern>
      <pattern id="pat-shale" width="8" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 1.5h3.5M4.5 4.5h3.5" style={ink} strokeWidth="0.9" opacity="0.55" />
      </pattern>
      <pattern id="pat-clay" width="8" height="3.5" patternUnits="userSpaceOnUse">
        <path d="M0 1.75h8" style={ink} strokeWidth="0.8" opacity="0.5" />
      </pattern>
      <pattern id="pat-siltstone" width="8" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 1.5h3.5" style={ink} strokeWidth="0.9" opacity="0.5" />
        <circle cx="6" cy="4.5" r="0.7" style={dot} opacity="0.5" />
      </pattern>
      <pattern id="pat-sandy-clay" width="8" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 1.5h8" style={ink} strokeWidth="0.8" opacity="0.45" />
        <circle cx="2" cy="4.5" r="0.7" style={dot} opacity="0.5" />
        <circle cx="6" cy="4.5" r="0.7" style={dot} opacity="0.5" />
      </pattern>
      <pattern id="pat-limestone" width="10" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 0.5h10M0 4.5h10M3 0.5v4M8 4.5v4" style={ink} strokeWidth="0.8" opacity="0.5" />
      </pattern>
      <pattern id="pat-gravel" width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.3" style={ink} strokeWidth="0.8" opacity="0.55" />
        <circle cx="6" cy="6" r="1.1" style={ink} strokeWidth="0.8" opacity="0.55" />
      </pattern>
      <pattern id="pat-basement" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M2 4h4M4 2v4" style={ink} strokeWidth="0.9" opacity="0.5" />
      </pattern>
      {/* Undrilled prognosis: the fill shows through a diagonal hatch in paper colour. */}
      <pattern id="pat-prognosis" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0v6" style={{ stroke: "var(--paper)", fill: "none" }} strokeWidth="2.6" />
      </pattern>
      {/* Drilled, samples not yet at the shakers. */}
      <pattern id="pat-transit" width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" style={{ fill: "var(--paper)" }} opacity="0.55" />
        <circle cx="1" cy="1" r="0.6" style={{ fill: "var(--ink-muted)" }} />
        <circle cx="3" cy="3" r="0.6" style={{ fill: "var(--ink-muted)" }} />
      </pattern>
      <marker id="dim-arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0.5 1.2 L4 4 L0.5 6.8" style={{ fill: "none", stroke: "var(--ink)" }} strokeWidth="1.1" />
      </marker>
    </defs>
  );
}
