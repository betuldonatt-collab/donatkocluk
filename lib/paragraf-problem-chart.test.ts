import { describe, expect, it } from "vitest";
import { aggregateParagrafProblemByDate, hasPracticeData, practiceChartSeries, type ParagrafProblemDay } from "./paragraf-problem-chart";

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

describe("practiceChartSeries: days without data are left out, not plotted at 0", () => {
  const c = (dogru: number, yanlis: number, sure: number) => ({ dogru, yanlis, bos: 0, sure });
  const days = [
    { date: "2026-10-01", paragraf: c(10, 2, 15), problem: c(0, 0, 0) }, // only Paragraf that day
    { date: "2026-10-02", paragraf: c(0, 0, 0), problem: c(8, 4, 20) }, // only Problem
    { date: "2026-10-03", paragraf: c(0, 0, 0), problem: c(0, 0, 0) }, // nothing at all
    { date: "2026-10-04", paragraf: c(12, 0, 18), problem: c(6, 2, 10) },
  ];
  const net = (d: number, y: number) => d - y / 4;

  it("keeps only the days the subject has data, in order, so the line bridges and the days sit side by side", () => {
    expect(practiceChartSeries(days, "paragraf", net)).toEqual([
      { date: "2026-10-01", a: 9.5, b: 15 },
      { date: "2026-10-04", a: 12, b: 18 },
    ]);
    expect(practiceChartSeries(days, "problem", net)).toEqual([
      { date: "2026-10-02", a: 7, b: 20 },
      { date: "2026-10-04", a: 5.5, b: 10 },
    ]);
  });

  it("a day nobody logged anything on is on neither chart", () => {
    for (const subject of ["paragraf", "problem"] as const) {
      expect(practiceChartSeries(days, subject, net).some((p) => p.date === "2026-10-03")).toBe(false);
    }
  });

  it("a real result keeps its point even at net 0 or below, and time alone counts as data", () => {
    const real = [
      { date: "2026-10-01", paragraf: c(4, 16, 10), problem: c(0, 0, 0) }, // net 0 from 20 answered questions
      { date: "2026-10-02", paragraf: c(0, 8, 5), problem: c(0, 0, 0) }, // negative net
      { date: "2026-10-03", paragraf: c(0, 0, 12), problem: c(0, 0, 0) }, // only time spent
    ];
    expect(practiceChartSeries(real, "paragraf", net).map((p) => [p.date, p.a, p.b])).toEqual([
      ["2026-10-01", 0, 10],
      ["2026-10-02", -2, 5],
      ["2026-10-03", 0, 12],
    ]);
    expect(hasPracticeData(c(0, 0, 0))).toBe(false);
    expect(hasPracticeData(c(0, 0, 1))).toBe(true);
  });

  it("no data at all gives an empty chart", () => {
    expect(practiceChartSeries([], "paragraf", net)).toEqual([]);
    expect(practiceChartSeries([{ date: "2026-10-01", paragraf: c(0, 0, 0), problem: c(0, 0, 0) }], "problem", net)).toEqual([]);
  });
});
