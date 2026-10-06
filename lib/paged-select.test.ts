import { describe, expect, it, vi } from "vitest";

import { fetchAllPages, PAGE_SIZE } from "./paged-select";

// A fake table of n numbered rows behind a PostgREST-like range query (rows past the range are simply not returned).
function table(n: number, opts: { withCount?: boolean; failAt?: number } = {}) {
  const calls: { from: number; to: number; withCount: boolean }[] = [];
  const fetchPage = async (from: number, to: number, withCount: boolean) => {
    calls.push({ from, to, withCount });
    if (opts.failAt !== undefined && from === opts.failAt) return { data: null, error: new Error("boom") };
    const data = Array.from({ length: Math.max(0, Math.min(n, to + 1) - from) }, (_, i) => from + i);
    return { data, error: null, count: opts.withCount === false ? null : n };
  };
  return { fetchPage, calls };
}

describe("fetchAllPages", () => {
  it("a short list takes one request", async () => {
    const t = table(37);
    const { data } = await fetchAllPages(t.fetchPage);
    expect(data).toHaveLength(37);
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toEqual({ from: 0, to: PAGE_SIZE - 1, withCount: true });
  });

  it("an empty list is empty", async () => {
    expect((await fetchAllPages(table(0).fetchPage)).data).toEqual([]);
  });

  it("a long list is read completely, in order, with the remaining pages fetched together", async () => {
    const t = table(2500);
    const { data } = await fetchAllPages(t.fetchPage);
    expect(data).toHaveLength(2500);
    expect(data[0]).toBe(0);
    expect(data[2499]).toBe(2499);
    expect(data).toEqual([...data].sort((a, b) => a - b));
    expect(t.calls.map((c) => c.from)).toEqual([0, 1000, 2000]);
    expect(t.calls.filter((c) => c.withCount)).toHaveLength(1);
  });

  it("exactly one full page does not lose or repeat anything", async () => {
    const { data } = await fetchAllPages(table(PAGE_SIZE).fetchPage);
    expect(data).toHaveLength(PAGE_SIZE);
  });

  it("walks page by page when no total comes back", async () => {
    const t = table(2300, { withCount: false });
    const { data } = await fetchAllPages(t.fetchPage);
    expect(data).toHaveLength(2300);
    expect(t.calls.map((c) => c.from)).toEqual([0, 1000, 2000]);
  });

  it("a failing page never throws: the read comes back empty with the error set, not as a partial list", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const late = await fetchAllPages(table(2500, { failAt: 1000 }).fetchPage);
    expect(late.data).toEqual([]);
    expect(late.error).toBeInstanceOf(Error);
    const early = await fetchAllPages(table(10, { failAt: 0 }).fetchPage);
    expect(early).toMatchObject({ data: [], error: expect.any(Error) });
    spy.mockRestore();
  });

  it("reports no error on success", async () => {
    expect((await fetchAllPages(table(5).fetchPage)).error).toBeNull();
  });
});
