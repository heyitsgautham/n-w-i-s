import type { z } from "zod";
import { envOr } from "./env";

/** Where the browser reaches the API. The server side uses WELLS_API_URL in lib/data.ts. */
export const API = envOr(process.env.NEXT_PUBLIC_API_URL, "http://localhost:8121");

/** The API answered, but not with what the screen needs: an error status, or a body of the wrong shape. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetches `url` and checks the JSON against `schema`. Rejects with an ApiError on a non-2xx status,
 * naming the API's own `detail` when it sent one, and on a body that does not match.
 */
export async function fetchJson<S extends z.ZodType>(url: string, schema: S, init?: RequestInit): Promise<z.output<S>> {
  const res = await fetch(url, init);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string" ? `: ${body.detail}` : "";
    throw new ApiError(`API ${res.status}${detail}`, res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path.length ? ` at ${issue.path.join(".")}` : "";
    throw new ApiError(`unexpected response from ${new URL(url).pathname}${where}: ${issue.message}`, res.status);
  }
  return parsed.data;
}
