import { API_URL, loadField } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * The web server's health, for docker compose and load balancers.
 * Every page reads the demo pack, so a missing pack answers 503.
 * The API only backs review, search and the report drawer, so an unreachable API is reported but still answers 200.
 */
export async function GET(): Promise<Response> {
  let wells: number | null = null;
  let packError: string | null = null;
  try {
    wells = loadField().wells.length;
  } catch (e) {
    packError = e instanceof Error ? e.message : String(e);
  }
  let api = false;
  try {
    api = (await fetch(`${API_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    api = false;
  }
  const ok = packError === null;
  return Response.json({ ok, pack: ok ? { wells } : { error: packError }, api }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
