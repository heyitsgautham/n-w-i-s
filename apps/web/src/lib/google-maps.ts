/**
 * Loads the Google Maps JavaScript API once, with Google's own inline bootstrap, and hands out its
 * libraries. The key comes from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in apps/web/.env.local, which stays
 * out of git. Without a key, `mapsKey()` is empty and screens fall back to the drawn contour map.
 */

export const mapsKey = () => process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

type Importer = (name: string) => Promise<unknown>;

let importer: Importer | null = null;

function bootstrap(key: string): Importer {
  const w = window as unknown as { google?: { maps?: { importLibrary?: Importer } } };
  if (w.google?.maps?.importLibrary) return w.google.maps.importLibrary;
  // Google's documented dynamic loader: it defines google.maps.importLibrary and fetches the API on first use.
  const params = new URLSearchParams({ key, v: "weekly", callback: "google.maps.__ib__" });
  let loading: Promise<void> | null = null;
  const g = (((w.google ??= {}) as { maps?: Record<string, unknown> }).maps ??= {});
  const load = () =>
    (loading ??= new Promise<void>((resolve, reject) => {
      (g as Record<string, unknown>).__ib__ = resolve;
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      s.async = true;
      s.onerror = () => reject(new Error("The Google Maps API did not load"));
      document.head.append(s);
    }));
  const lazy: Importer = (name) => load().then(() => (g.importLibrary as Importer)(name));
  g.importLibrary = lazy;
  return lazy;
}

export function importLibrary<T>(name: string): Promise<T> {
  const key = mapsKey();
  if (!key) return Promise.reject(new Error("No Google Maps key"));
  importer ??= bootstrap(key);
  return importer(name) as Promise<T>;
}
