"use client";

import type { OffsetEvent } from "@wells/correlate";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useCallTimeline } from "@/hooks/use-call-timeline";
import { useReplay, type ReplayControls } from "@/hooks/use-replay";
import type { HeroModel } from "@/lib/hero-model";
import { buildScene, TIMELINE_MS, type NumberedAlert, type Scene } from "@/lib/scene";

export interface DrawerTarget {
  event: OffsetEvent;
  /** Set when the event is on the active well's alert list. */
  alert?: NumberedAlert;
}

interface Console {
  model: HeroModel;
  replay: ReplayControls;
  scene: Scene;
  /** Milliseconds since the latest call arrived in this session, null when settled or none. */
  callElapsed: number | null;
  retie: "none" | "animating" | "settled";
  drawer: DrawerTarget | null;
  openEvent: (event: OffsetEvent) => void;
  closeDrawer: () => void;
}

const Ctx = createContext<Console | null>(null);

export function useConsole(): Console {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConsole outside ConsoleProvider");
  return c;
}

/**
 * The rig's live state for every screen. The replay keeps ticking while the engineer looks at the
 * map or reads a report, the way the real well keeps drilling.
 * `?tick=<n>` opens the replay at a tick and `?play=1` starts it playing.
 */
export function ConsoleProvider({ model, children }: { model: HeroModel; children: React.ReactNode }) {
  const lastTick = model.replay.ticks.length - 1;
  const callTicks = useMemo(() => model.replay.messages.filter((m) => m.topCall).map((m) => m.tick), [model]);
  const replay = useReplay(model.replay.openTick, lastTick, model.replay.openTick, false, callTicks);
  const { jump } = replay;
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (!p.has("tick") && !p.has("play")) return;
    const t = Number(p.get("tick"));
    jump(p.has("tick") && Number.isInteger(t) ? t : model.replay.openTick, p.get("play") === "1");
  }, [jump, model.replay.openTick]);
  const elapsed = useCallTimeline(replay.arrival, TIMELINE_MS);
  const latestCall = callTicks.filter((t) => t <= replay.tick).at(-1);
  const callElapsed = replay.arrival && replay.arrival.tick === latestCall ? elapsed : null;
  const scene = useMemo(() => buildScene(model, replay.tick, callElapsed), [model, replay.tick, callElapsed]);
  const retie = scene.call === null ? "none" : callElapsed !== null && callElapsed < TIMELINE_MS ? "animating" : "settled";

  const [drawerId, setDrawerId] = useState<{ event: OffsetEvent } | null>(null);
  const drawer = useMemo<DrawerTarget | null>(() => {
    if (!drawerId) return null;
    const alert = scene.alerts.find((a) => a.event.id === drawerId.event.id);
    return alert ? { event: drawerId.event, alert } : { event: drawerId.event };
  }, [drawerId, scene.alerts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value: Console = {
    model,
    replay,
    scene,
    callElapsed,
    retie,
    drawer,
    openEvent: (event) => setDrawerId({ event }),
    closeDrawer: () => setDrawerId(null),
  };
  return (
    <Ctx.Provider value={value}>
      <div className="contents" data-tick={replay.tick} data-retie={retie}>
        {children}
      </div>
    </Ctx.Provider>
  );
}
