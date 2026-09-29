import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DemoPack, OffsetEvent } from "@wells/correlate";

/**
 * Server-side access to the demo pack. The web app reads the same files the API reads:
 * data/demo/field.json from the generator and data/demo/extracted/ from the parser.
 */
const DATA_DIR = process.env.WELLS_DATA_DIR ?? findDataDir(process.cwd());

/** Walks up from the working directory, so the app runs from apps/web or from the repo root. */
function findDataDir(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "data", "demo");
    if (existsSync(path.join(candidate, "field.json"))) return candidate;
    if (path.dirname(dir) === dir) throw new Error(`no data/demo/field.json above ${from}; run \`make data\``);
  }
}

/** Server-to-server address of the API. The browser uses NEXT_PUBLIC_API_URL. */
export const API_URL = process.env.WELLS_API_URL ?? "http://127.0.0.1:8121";

export type Field = Omit<DemoPack, "reports">;

export interface ExtractedEvent extends OffsetEvent {
  time: string | null;
  fieldConfidence: Record<string, number>;
  reviewed?: "confirm" | "reject" | null;
}

export interface ExtractionStats {
  documents: number;
  pages: number;
  ocrPages: number;
  textPages: number;
  wells: number;
  events: number;
  needsReview: number;
  reviewThreshold: number;
  eventConfidence: { from: number; to: number; count: number }[];
  ocrPageConfidence: { from: number; to: number; count: number }[];
  accuracy: Record<string, number>;
}

let field: Field | null = null;
let extracted: ExtractedEvent[] | null = null;

export function loadField(): Field {
  field ??= JSON.parse(readFileSync(path.join(DATA_DIR, "field.json"), "utf8")) as Field;
  return field;
}

export function loadExtracted(): ExtractedEvent[] {
  extracted ??= JSON.parse(readFileSync(path.join(DATA_DIR, "extracted", "events.json"), "utf8")) as ExtractedEvent[];
  return extracted;
}

export function loadStats(): ExtractionStats {
  return JSON.parse(readFileSync(path.join(DATA_DIR, "extracted", "stats.json"), "utf8")) as ExtractionStats;
}

/** Review decisions live in the API. Without it, nothing counts as reviewed. */
export async function reviewDecisions(): Promise<Record<string, "confirm" | "reject">> {
  try {
    const res = await fetch(`${API_URL}/review/decisions`, { cache: "no-store", signal: AbortSignal.timeout(800) });
    return res.ok ? ((await res.json()) as Record<string, "confirm" | "reject">) : {};
  } catch {
    return {};
  }
}

/**
 * Parsed events as the product may use them: a confirmed event no longer needs review, a rejected
 * one is gone, and an event whose depth could not be read is never placed.
 */
export async function liveEvents(): Promise<ExtractedEvent[]> {
  const decisions = await reviewDecisions();
  return loadExtracted()
    .filter((e) => e.md !== null && decisions[e.id] !== "reject")
    .map((e) => ({ ...e, needsReview: e.needsReview && decisions[e.id] !== "confirm", reviewed: decisions[e.id] ?? null }));
}
