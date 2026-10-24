"use client";

import { useLayoutEffect, useState } from "react";

/** The window size, kept current on resize. 1600 by 900 until the first layout. */
export function useViewport() {
  const [size, setSize] = useState({ w: 1600, h: 900 });
  useLayoutEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return size;
}
