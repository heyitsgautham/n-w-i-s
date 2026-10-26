import type { Instrumentation } from "next";

type ErrorRequest = Parameters<Instrumentation.onRequestError>[1];
type ErrorContext = Parameters<Instrumentation.onRequestError>[2];

/**
 * One JSON line for an error Next.js caught while serving a request, in the same shape as the API's
 * logs: ts, level, logger, msg, then the fields. The request id is the caller's X-Request-ID when it sent
 * one, so an error can be followed from the web server into the API. The digest is the id Next.js shows
 * the visitor on its error page.
 */
export function requestErrorLine(error: unknown, request: ErrorRequest, context: ErrorContext, now = new Date()): string {
  const err = error instanceof Error ? error : new Error(String(error));
  const rid = request.headers["x-request-id"];
  return JSON.stringify({
    ts: now.toISOString(),
    level: "error",
    logger: "wells_web",
    msg: "request error",
    method: request.method,
    path: request.path,
    route: context.routePath,
    route_type: context.routeType,
    request_id: Array.isArray(rid) ? rid[0] : (rid ?? null),
    digest: (err as Error & { digest?: string }).digest ?? null,
    error: `${err.name}: ${err.message}`,
    exc: err.stack ?? null,
  });
}

/** Next.js calls this for every error thrown while rendering a page or running a route handler. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  console.error(requestErrorLine(error, request, context));
};
