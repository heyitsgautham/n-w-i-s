import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BriefingExport, Decisions, Ingestion, ReviewQueue, SearchResponse } from "./schemas";

/** The committed demo pack, which is what the API reads and answers from. */
const pack = (file: string) => JSON.parse(readFileSync(path.join(__dirname, "../../../../data/demo", file), "utf8"));

describe("schemas against the demo pack", () => {
  const stats = pack("extracted/stats.json");
  const events = pack("extracted/events.json") as Record<string, unknown>[];

  it("accept /ingestion as the API builds it, with and without the Volve run", () => {
    const body = { ...stats, pendingReview: 4, confirmed: 0, rejected: 0, scannedDocuments: 190, volve: null };
    expect(Ingestion.parse(body).accuracy.found).toBe(stats.accuracy.found);
    const volve = JSON.parse(readFileSync(path.join(__dirname, "../../../../data/volve/metrics.json"), "utf8"));
    expect(Ingestion.parse({ ...body, volve }).volve?.reports).toBe(volve.reports);
  });

  it("reject /ingestion when the pack stats are missing", () => {
    expect(Ingestion.safeParse({ detail: "no demo pack at /data" }).success).toBe(false);
  });

  it("accept every parsed event as a review item, keeping the fields they do not check", () => {
    const queue = ReviewQueue.parse(events.map((e) => ({ ...e, reviewed: null })));
    expect(queue).toHaveLength(events.length);
    expect(queue[0].narrative).toBe(events[0].narrative);
  });

  it("accept a search answer and reject one without results", () => {
    const results = events.slice(0, 2).map((e) => ({ ...e, formationId: "TPM", distanceKm: 1.2, score: 3 }));
    const body = { query: "losses in Tipam", filters: [{ key: "formation", value: "TPM" }], terms: [], count: 2, results };
    expect(SearchResponse.parse(body).results[1].id).toBe(events[1].id);
    expect(SearchResponse.safeParse({ ...body, results: undefined }).success).toBe(false);
    expect(SearchResponse.safeParse({ ...body, filters: [{ key: "colour", value: "red" }] }).success).toBe(false);
  });

  it("check the briefing export and the review decisions", () => {
    expect(BriefingExport.parse({ id: "a1", pages: 2, bytes: 4096, url: "/briefing/a1.pdf" }).pages).toBe(2);
    expect(BriefingExport.safeParse({ id: "a1", pages: -1, bytes: 1, url: "/x" }).success).toBe(false);
    expect(Decisions.parse({ "KN-107-B06": "confirm" })).toEqual({ "KN-107-B06": "confirm" });
    expect(Decisions.safeParse({ "KN-107-B06": "maybe" }).success).toBe(false);
  });
});
