import { describe, expect, it } from "vitest";
import { aggregateParagrafProblemByDate, type ParagrafProblemDay } from "./paragraf-problem-chart";

const ZERO = { dogru: 0, yanlis: 0, bos: 0, sure: 0 };
const row = (date: string, paragraf = ZERO, problem = ZERO): ParagrafProblemDay => ({ date, paragraf, problem });

describe("aggregateParagrafProblemByDate", () => {
  it("sums two same-day rows (e.g. a manual entry plus an auto-synced task) into one", () => {
    const result = aggregateParagrafProblemByDate([
      row("2026-09-21", { dogru: 10, yanlis: 2, bos: 0, sure: 20 }),
      row("2026-09-21", { dogru: 5, yanlis: 1, bos: 0, sure: 15 }),
    ]);
    expect(result).toEqual([row("2026-09-21", { dogru: 15, yanlis: 3, bos: 0, sure: 35 })]);
  });

  it("sums paragraf and problem independently", () => {
    const result = aggregateParagrafProblemByDate([
      row("2026-09-21", { dogru: 10, yanlis: 0, bos: 0, sure: 20 }, ZERO),
      row("2026-09-21", ZERO, { dogru: 8, yanlis: 1, bos: 1, sure: 10 }),
    ]);
    expect(result[0].paragraf).toEqual({ dogru: 10, yanlis: 0, bos: 0, sure: 20 });
    expect(result[0].problem).toEqual({ dogru: 8, yanlis: 1, bos: 1, sure: 10 });
  });

  it("leaves distinct dates as separate rows, sorted ascending", () => {
    const result = aggregateParagrafProblemByDate([row("2026-09-23"), row("2026-09-21"), row("2026-09-22")]);
    expect(result.map((r) => r.date)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
  });

  it("is empty for no rows", () => {
    expect(aggregateParagrafProblemByDate([])).toEqual([]);
  });
});
