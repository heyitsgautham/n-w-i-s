"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cameraAt, FOV_DEG, GROUND_M } from "@/lib/arrival";
import type { ArrivalData } from "@/lib/data";
import { importLibrary } from "@/lib/google-maps";

type Map3D = HTMLElement & {
  center: { lat: number; lng: number; altitude: number };
  range: number;
  tilt: number;
  heading: number;
};

type LineEnds = { a: { x: number; y: number }; b: { x: number; y: number } };

/**
 * Google's 3D satellite map for the arrival, created once in `mapBox`.
 * `applyCamera(t)` moves it to the arrival's camera at t seconds, and `steady` turns true once the
 * tiles for the current camera have loaded. Without a key the map is never created and reads as
 * ready and steady at once. If the library fails to load, `onFail` runs and it reads the same way.
 */
export function useSatellite(hasKey: boolean, anchor: ArrivalData["anchor"], lineEnds: LineEnds, onFail: () => void) {
  const mapBox = useRef<HTMLDivElement>(null);
  const map = useRef<Map3D | null>(null);
  const steady = useRef(!hasKey);
  const [mapReady, setMapReady] = useState(!hasKey);
  const fail = useRef(onFail);
  useEffect(() => {
    fail.current = onFail;
  });

  const applyCamera = useCallback(
    (time: number) => {
      const m = map.current;
      if (!m) return;
      const c = cameraAt(time, anchor, lineEnds);
      m.center = { lat: c.lat, lng: c.lng, altitude: GROUND_M };
      m.range = c.range;
      m.tilt = c.tilt;
      m.heading = c.heading;
    },
    [anchor, lineEnds],
  );

  useEffect(() => {
    if (!hasKey) return;
    let live = true;
    importLibrary<{ Map3DElement: new (o: object) => Map3D }>("maps3d")
      .then(({ Map3DElement }) => {
        if (!live || !mapBox.current) return;
        const c = cameraAt(0, anchor, lineEnds);
        const m = new Map3DElement({
          mode: "SATELLITE",
          defaultUIHidden: true,
          fov: FOV_DEG,
          center: { lat: c.lat, lng: c.lng, altitude: GROUND_M },
          range: c.range,
          tilt: c.tilt,
          heading: c.heading,
        });
        m.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
        m.addEventListener("gmp-steadychange", (e) => {
          steady.current = (e as unknown as { isSteady: boolean }).isSteady;
        });
        mapBox.current.append(m);
        map.current = m;
        setMapReady(true);
      })
      .catch(() => {
        steady.current = true;
        setMapReady(true);
        fail.current();
      });
    return () => {
      live = false;
      map.current?.remove();
      map.current = null;
    };
  }, [hasKey, anchor, lineEnds]);

  return { mapBox, mapReady, steady, applyCamera };
}
