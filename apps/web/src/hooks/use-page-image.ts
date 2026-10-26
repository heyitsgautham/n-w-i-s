"use client";

import { useEffect, useState } from "react";

export type PageImage = "loading" | "ready" | "missing";

/**
 * Whether a report page image loads. The API answers 404 for a report `make data` has not rendered,
 * which is every well but four in a fresh checkout or a `docker compose up`.
 */
export function usePageImage(src: string): PageImage {
  const [state, setState] = useState<{ src: string; status: PageImage }>({ src, status: "loading" });
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => live && setState({ src, status: "ready" });
    img.onerror = () => live && setState({ src, status: "missing" });
    img.src = src;
    return () => {
      live = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);
  return state.src === src ? state.status : "loading";
}
