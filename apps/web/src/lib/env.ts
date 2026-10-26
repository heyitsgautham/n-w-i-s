/**
 * An environment value, or `fallback` when it is unset, empty or blank.
 * `.env.example` lists every variable, some with no value, so `NAME=` must mean the default, not "".
 * Pass `process.env.NEXT_PUBLIC_*` by its literal name, so Next.js can inline it into the browser bundle.
 */
export function envOr(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}
