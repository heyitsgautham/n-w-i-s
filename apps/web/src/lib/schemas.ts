import type { OffsetEvent } from "@wells/correlate";
import { z } from "zod";

/**
 * The shapes the browser expects back from the API, checked on arrival by fetchJson in api.ts.
 * An error body, such as `{"detail": "no rendered document"}` with a 404, fails here with a message
 * instead of reaching a component as data and crashing the render.
 * Objects are loose, so a field the API adds later passes through untouched.
 */

const count = z.number().int().nonnegative();
const box = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/**
 * Checks a body with `schema` and types what passes as T. Events carry the whole OffsetEvent, and only the
 * fields a screen reads are worth checking, so these schemas are narrower than the type they hand back.
 */
function typed<T>(schema: z.ZodType): z.ZodType<T> {
  return schema as unknown as z.ZodType<T>;
}

/** The fields a screen reads off an event. The rest of OffsetEvent passes through unchecked. */
const event = z.looseObject({
  id: z.string(),
  wellId: z.string(),
  kind: z.string(),
  title: z.string(),
  md: z.number().nullable(),
  date: z.string(),
  source: z.looseObject({ docId: z.string(), page: z.number().nullable(), bbox: box.optional(), ocr: z.boolean().optional() }),
});

/** Tesseract's words for a page, line by line from the top, in PDF points: text, x0, top, x1, bottom. */
export const PageWords = z.looseObject({
  ocr: z.boolean(),
  lines: z.array(z.object({ conf: z.number(), words: z.array(z.tuple([z.string(), z.number(), z.number(), z.number(), z.number()])) })),
});
export type PageWords = z.infer<typeof PageWords>;

const bins = z.array(z.object({ from: z.number(), to: z.number(), count }));

const Volve = z.looseObject({
  reports: count,
  wells: count,
  activities: count,
  hazardActivities: count,
  reportsWithHazard: count,
  byKind: z.record(z.string(), count),
  examples: z.record(z.string(), z.object({ text: z.string(), report: z.string(), md: z.number() })),
  handCheck: z.object({ sample: count, seed: z.number(), right: count, otherHazard: count, notAHazard: count }),
});
export type Volve = z.infer<typeof Volve>;

export const Ingestion = z.looseObject({
  documents: count,
  pages: count,
  ocrPages: count,
  textPages: count,
  wells: count,
  events: count,
  needsReview: count,
  reviewThreshold: z.number(),
  eventConfidence: bins,
  ocrPageConfidence: bins,
  accuracy: z.looseObject({
    truthEvents: count,
    extractedEvents: count,
    found: count,
    kindRight: count,
    depthExact: count,
    mudWeightExact: count,
    nptExact: count,
    missed: z.array(z.object({ id: z.string(), docId: z.string(), scanned: z.boolean() })),
  }),
  pendingReview: count,
  confirmed: count,
  rejected: count,
  scannedDocuments: count,
  volve: Volve.nullable(),
});
export type Ingestion = z.infer<typeof Ingestion>;

export type ReviewItem = OffsetEvent & { fieldConfidence: Record<string, number>; reviewed: "confirm" | "reject" | null };
export const ReviewQueue = typed<ReviewItem[]>(
  z.array(event.extend({ fieldConfidence: z.record(z.string(), z.number()), reviewed: z.enum(["confirm", "reject"]).nullable() })),
);

export interface SearchResult extends OffsetEvent {
  formationId: string | null;
  distanceKm: number;
  score: number;
}
export interface SearchResponse {
  query: string;
  filters: { key: "kind" | "formation" | "radius" | "yearFrom" | "yearTo"; value: string | number }[];
  terms: string[];
  count: number;
  results: SearchResult[];
}
export const SearchResponse = typed<SearchResponse>(
  z.looseObject({
    query: z.string(),
    filters: z.array(z.object({ key: z.enum(["kind", "formation", "radius", "yearFrom", "yearTo"]), value: z.union([z.string(), z.number()]) })),
    terms: z.array(z.string()),
    count,
    results: z.array(event.extend({ formationId: z.string().nullable(), distanceKm: z.number(), score: z.number() })),
  }),
);

/** What POST /briefing/pdf answers once it has rendered the PDF. */
export const BriefingExport = z.looseObject({ id: z.string(), pages: count, bytes: count, url: z.string() });
export type BriefingExport = z.infer<typeof BriefingExport>;

/** POST /review/{id}: the call as the API recorded it. */
export const Decided = z.looseObject({ id: z.string(), decision: z.enum(["confirm", "reject"]) });

/** GET /review/decisions: event id to the reviewer's call. */
export const Decisions = z.record(z.string(), z.enum(["confirm", "reject"]));
