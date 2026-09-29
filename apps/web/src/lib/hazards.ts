import type { EventKind } from "@wells/correlate";

export const KIND_LABEL: Record<EventKind, string> = {
  losses: "Losses",
  "tight-hole": "Tight hole",
  caving: "Caving, pack-off",
  "stuck-pipe": "Stuck pipe",
  kick: "Kick, gain",
  "differential-sticking": "Differential sticking",
  "bit-balling": "Bit balling",
};

/** One colour per kind of incident, told apart on satellite imagery and on the dark console. */
export const KIND_COLOR: Record<EventKind, string> = {
  losses: "#38bdf8",
  "tight-hole": "#e2e8f0",
  caving: "#f472b6",
  "stuck-pipe": "#fb923c",
  kick: "#a78bfa",
  "differential-sticking": "#facc15",
  "bit-balling": "#4ade80",
};
