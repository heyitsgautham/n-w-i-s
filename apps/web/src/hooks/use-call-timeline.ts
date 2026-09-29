"use client";

import { useEffect, useState } from "react";
import type { Arrival } from "./use-replay";

/**
 * Milliseconds since the latest top call arrived in this session, or null when it did not arrive
 * in this session (no call yet, or the page opened after it), so a reload shows the settled state.
 * Frames come from requestAnimationFrame and performance.now, which a test clock controls.
 */
export function useCallTimeline(arrival: Arrival | null, durationMs: number): number | null {
  const [frame, setFrame] = useState<{ arrival: Arrival; ms: number } | null>(null);

  useEffect(() => {
    if (!arrival) return;
    let id = 0;
    const loop = () => {
      const ms = Math.min(performance.now() - arrival.at, durationMs);
      setFrame({ arrival, ms });
      if (ms < durationMs) id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [arrival, durationMs]);

  if (!arrival) return null;
  return frame?.arrival === arrival ? frame.ms : 0;
}
