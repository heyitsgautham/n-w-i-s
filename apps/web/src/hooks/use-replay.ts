"use client";

import { useCallback, useEffect, useState } from "react";

/** One replay tick is ten seconds of rig time. Playing shows one tick per second, ten times real time. */
export const MS_PER_TICK = 1000;

/** A top call the replay stepped onto in this session, and when, on the page's clock. */
export interface Arrival {
  tick: number;
  at: number;
}

export interface ReplayControls {
  tick: number;
  playing: boolean;
  atEnd: boolean;
  arrival: Arrival | null;
  toggle: () => void;
  step: () => void;
  reset: () => void;
  /** Moves straight to a tick without replaying the calls on the way, and sets play or pause. */
  jump: (tick: number, play: boolean) => void;
}

/**
 * Deterministic replay clock. Every state is a function of the tick, and the tick only moves on a
 * timer, a button or a key, so a scripted take lands the same frames on every run.
 * Stepping onto a call tick records the arrival, which starts the re-tie animation.
 */
export function useReplay(openTick: number, lastTick: number, initialTick: number, autoplay: boolean, callTicks: number[]): ReplayControls {
  const [state, setState] = useState<{ tick: number; arrival: Arrival | null }>({ tick: initialTick, arrival: null });
  const [playRequested, setPlayRequested] = useState(autoplay);
  const atEnd = state.tick >= lastTick;
  const playing = playRequested && !atEnd;

  const step = useCallback(() => {
    const at = performance.now();
    setState((s) => {
      if (s.tick >= lastTick) return s;
      const next = s.tick + 1;
      const crossed = callTicks.find((c) => s.tick < c && c <= next);
      return { tick: next, arrival: crossed === undefined ? s.arrival : { tick: crossed, at } };
    });
  }, [lastTick, callTicks]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(step, MS_PER_TICK);
    return () => clearInterval(id);
  }, [playing, step]);

  const toggle = useCallback(() => setPlayRequested((p) => !p), []);
  const jump = useCallback(
    (tick: number, play: boolean) => {
      setState({ tick: Math.min(Math.max(tick, 0), lastTick), arrival: null });
      setPlayRequested(play);
    },
    [lastTick],
  );
  const reset = useCallback(() => {
    setPlayRequested(false);
    setState({ tick: openTick, arrival: null });
  }, [openTick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing in a field, the search box or a briefing line, is never a replay shortcut.
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select, [contenteditable]"))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.code === "ArrowRight") step();
      else if (e.key === "r") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, step, reset]);

  return { tick: state.tick, playing, atEnd, arrival: state.arrival, toggle, step, reset, jump };
}
