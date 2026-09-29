import type { Bed, CurveSample, FormationTop, Replay, RigMessage, Telemetry } from "@wells/correlate";
import { ROP } from "./column";
import { rng } from "./rng";
import { ACTIVE, REPLAY } from "./scenario";
import { lithologyAt, round1 } from "./wells";

/**
 * Drilling replay for the active well at 10-second ticks.
 * ROP noise is a sum of sines whose periods (30, 15 and 10 ticks) divide both the 10-minute
 * averaging window and the time from the drilling break to the call. That keeps the averaged
 * ROP at exactly 12.0 m/h and lands the bit at exactly 2,883 m on the call tick.
 */
export function buildReplay(seed: number, truthTops: FormationTop[], truthBeds: Bed[]): Replay {
  const r = rng(seed, "replay");
  const dt = REPLAY.tickSeconds / 3600;
  const callTick = REPLAY.ticksBeforeCall;
  const breakTicksExact = ((REPLAY.bitAtCallMd - REPLAY.call.md) / REPLAY.ropBelow) * (3600 / REPLAY.tickSeconds);
  const breakTick = callTick - Math.round(breakTicksExact);
  if (Math.abs(breakTicksExact - Math.round(breakTicksExact)) > 1e-9 || (callTick - breakTick) % 30 !== 0) {
    throw new Error("drilling break must sit a whole number of 30-tick noise cycles before the call");
  }
  const lagTicks = (REPLAY.lagMinutes * 60) / REPLAY.tickSeconds;
  const phase = [r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28)];
  const ripple = (i: number) =>
    0.05 * Math.sin((2 * Math.PI * i) / 30 + phase[0]!) +
    0.035 * Math.sin((2 * Math.PI * i) / 15 + phase[1]!) +
    0.02 * Math.sin((2 * Math.PI * i) / 10 + phase[2]!);
  const rop = (i: number) => (i < breakTick ? REPLAY.ropAbove : REPLAY.ropBelow) * (1 + ripple(i));

  const bitAt = (i: number): number => {
    let md = REPLAY.call.md;
    if (i >= breakTick) for (let k = breakTick; k < i; k++) md += rop(k) * dt;
    else for (let k = i; k < breakTick; k++) md -= rop(k) * dt;
    return md;
  };

  const start = Date.parse(REPLAY.callTime) - callTick * REPLAY.tickSeconds * 1000;
  const timeAt = (i: number) => istIso(start + i * REPLAY.tickSeconds * 1000);

  const last = REPLAY.ticksBeforeCall + REPLAY.ticksAfterCall;
  const ticks: Telemetry[] = [];
  for (let i = 0; i <= last; i++) {
    let sum = 0;
    for (let k = i - 59; k <= i; k++) sum += rop(k);
    ticks.push({
      tick: i,
      time: timeAt(i),
      bitMd: round2(bitAt(i)),
      samplesMd: round2(bitAt(i - lagTicks)),
      ropInstant: round2(rop(i)),
      ropAvg: round2(sum / 60),
      wobTonnes: round1(REPLAY.wobTonnes + 0.4 * Math.sin(i / 7 + phase[0]!)),
      rpm: Math.round(REPLAY.rpm + 1.5 * Math.sin(i / 5 + phase[1]!)),
      flowGpm: Math.round(REPLAY.flowGpm + 3 * Math.sin(i / 11 + phase[2]!)),
      mudWeightPpg: ACTIVE.mudWeightPpg,
    });
  }

  const fmt = (md: number) => Math.round(md).toLocaleString("en-US");
  const hhmm = (i: number) => timeAt(i).slice(11, 16);
  const message = (tick: number, source: RigMessage["source"], text: string, extra: Partial<RigMessage> = {}): RigMessage => ({
    tick,
    time: timeAt(tick),
    source,
    text,
    ...extra,
  });
  const earlier = -150;
  const messages: RigMessage[] = [
    message(
      earlier,
      "driller",
      `Drilling ${ACTIVE.holeSizeIn} in hole in Tipam at ${fmt(bitAt(earlier))} m. WOB ${REPLAY.wobTonnes} t, ${REPLAY.rpm} rpm, ${REPLAY.flowGpm} gpm.`,
    ),
    message(breakTick + 6, "driller", `Drilling break at ${fmt(REPLAY.call.md)} m, ROP ${REPLAY.ropAbove} → ${REPLAY.ropBelow} m/h.`),
    message(
      breakTick + 12,
      "mud-logger",
      `Samples from ${fmt(REPLAY.call.md)} m due at the shakers ${hhmm(breakTick + lagTicks)}, lag ${REPLAY.lagMinutes} min.`,
    ),
    message(callTick, "mud-logger", `${REPLAY.call.spoken} top called at ${fmt(REPLAY.call.md)} m. Cuttings ${REPLAY.cuttings}.`, {
      topCall: { formationId: REPLAY.call.formationId, md: REPLAY.call.md },
    }),
  ];

  // Depth-indexed ROP for the hole drilled before the replay starts, from the lithology it cut.
  const history: CurveSample[] = [];
  const hr = rng(seed, "replay/rop-history");
  const firstBit = bitAt(0);
  for (let md = 2400; md < firstBit; md += 1) {
    const base = ROP[lithologyAt(truthTops, truthBeds, md)] ?? 15;
    history.push({ md, value: round1(base * (1 + hr.normal(0, 0.07))) });
  }

  return {
    wellId: ACTIVE.id,
    tickSeconds: REPLAY.tickSeconds,
    openTick: callTick - REPLAY.openTicksBeforeCall,
    ticks,
    messages,
    ropByDepth: history,
    lagMinutes: REPLAY.lagMinutes,
    gammaSensorOffset: REPLAY.gammaSensorOffset,
    holeSizeIn: ACTIVE.holeSizeIn,
  };
}

/** ISO 8601 in Indian Standard Time, which the rig keeps. */
function istIso(utcMs: number): string {
  const ist = new Date(utcMs + 5.5 * 3600 * 1000);
  return `${ist.toISOString().slice(0, 19)}+05:30`;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
