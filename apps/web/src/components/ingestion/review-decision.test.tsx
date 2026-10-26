// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IngestionScreen } from "./ingestion-screen";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/console/console-provider", () => ({ useConsole: () => ({ openEvent: vi.fn() }) }));

const pack = (file: string) => JSON.parse(readFileSync(path.join(__dirname, "../../../../../data/demo", file), "utf8"));
const stats = pack("extracted/stats.json");
const queue = (pack("extracted/events.json") as { needsReview: boolean }[]).filter((e) => e.needsReview).map((e) => ({ ...e, reviewed: null }));
const ingestion = { ...stats, pendingReview: queue.length, confirmed: 0, rejected: 0, scannedDocuments: 190, volve: null };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Answers the two GETs the screen opens with, and hands POSTs to `post`. */
function api(post: (url: string) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return post(url);
      return url.endsWith("/ingestion") ? json(ingestion) : json(queue);
    }),
  );
}

describe("a review decision", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal("Image", class {});
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reloads the queue and refreshes the console once the API records it", async () => {
    api(async (url) => json({ id: url.split("/").pop(), decision: "confirm" }));
    render(<IngestionScreen />);
    const confirm = (await screen.findAllByRole("button", { name: /Confirm/ }))[0]!;
    await act(async () => fireEvent.click(confirm));
    expect(refresh).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls.filter(([u]) => String(u).endsWith("/review"))).toHaveLength(2);
  });

  // Before, a failed POST was an unhandled rejection and the card stayed as if nothing had happened.
  it("says so when the API cannot record it", async () => {
    api(async () => Promise.reject(new TypeError("Failed to fetch")));
    render(<IngestionScreen />);
    const confirm = (await screen.findAllByRole("button", { name: /Confirm/ }))[0]!;
    await act(async () => fireEvent.click(confirm));
    expect(screen.getByText(/The API is not answering \(Failed to fetch\)/)).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says so when the API refuses it", async () => {
    api(async () => json({ detail: "no event KN-107-B06" }, 404));
    render(<IngestionScreen />);
    const confirm = (await screen.findAllByRole("button", { name: /Confirm/ }))[0]!;
    await act(async () => fireEvent.click(confirm));
    expect(screen.getByText(/API 404: no event KN-107-B06/)).toBeTruthy();
  });
});
