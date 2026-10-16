import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { completionPercent } from "./completion";
import { solvedCount, taskCredit, taskCreditFraction, taskWeight, weightedCounts, weightedCycleCounts, weightedDayCounts, type WeightableTask } from "./effort-weight";

// Partial credit, one rule for every percentage in the app: the denominator is every task's full weight, the numerator the share of it the
// status earned -- done 100%, half_done solved / target, not_done and pending nothing.

const math = (status: string, over: Partial<WeightableTask> = {}): WeightableTask => ({
  task_date: "2026-10-10",
  task_type: "question_bank",
  course_id: "tyt-matematik", // x2.0 -> 20 units per question
  title: "x",
  status,
  total_count: 40, // weight 800
  ...over,
});

describe("what a status earns of a task's weight", () => {
  it("done is 100% -- the five-question tolerance of the automatic status is what makes 35 / 40 (or 45 / 40) done", () => {
    expect(taskCreditFraction(math("done"))).toBe(1);
    expect(taskCreditFraction(math("done", { correct_count: 35 }))).toBe(1);
    expect(taskCreditFraction(math("done", { correct_count: 30, wrong_count: 8, empty_count: 7 }))).toBe(1); // 45 / 40
  });

  it("half_done earns solved / target (Doğru + Yanlış + Boş over Toplam): target 40, solved 25 -> 62.5%", () => {
    expect(taskCreditFraction(math("half_done", { correct_count: 15, wrong_count: 8, empty_count: 2 }))).toBe(0.625);
    expect(taskCredit(math("half_done", { correct_count: 15, wrong_count: 8, empty_count: 2 }))).toBe(taskWeight(math("done")) * 0.625);
  });

  it("half_done is capped at 100% and needs something solved and a target to be measured against", () => {
    expect(taskCreditFraction(math("half_done", { correct_count: 60 }))).toBe(1);
    expect(taskCreditFraction(math("half_done"))).toBe(0); // nothing solved
    expect(taskCreditFraction(math("half_done", { total_count: null, correct_count: 20 }))).toBe(0); // no target
    expect(taskCreditFraction(math("half_done", { total_count: 0, correct_count: 20 }))).toBe(0);
  });

  it("not_done and pending earn nothing, whatever was solved", () => {
    expect(taskCreditFraction(math("not_done", { correct_count: 30 }))).toBe(0);
    expect(taskCreditFraction(math("pending", { correct_count: 30 }))).toBe(0);
    expect(taskCredit(math("pending", { correct_count: 30 }))).toBe(0);
  });

  it("a ready-made solved_count (rows sent to a browser without the Doğru / Yanlış split) counts the same", () => {
    expect(solvedCount({ correct_count: 15, wrong_count: 8, empty_count: 2 })).toBe(25);
    expect(solvedCount({ solved_count: 25 })).toBe(25);
    expect(taskCreditFraction(math("half_done", { solved_count: 25 }))).toBe(0.625);
  });
});

describe("the percentage: every task's full weight below, what it earned above", () => {
  const tasks: WeightableTask[] = [
    math("done"), // 800 / 800
    math("half_done", { correct_count: 25 }), // 800 / 500
    math("not_done", { correct_count: 10 }), // 800 / 0
    math("pending"), // 800 / 0
  ];

  it("weightedCounts: earned 1300 of 3200 = 41%", () => {
    expect(weightedCounts(tasks)).toEqual({ done: 1300, total: 3200 });
    expect(completionPercent(weightedCounts(tasks))).toBe(41);
  });

  it("a half-done task counts more than a not-done one and less than a done one", () => {
    const pctWith = (status: string) => completionPercent(weightedCounts([math("done"), math(status, { correct_count: 25 })]));
    expect(pctWith("not_done")).toBe(50);
    expect(pctWith("half_done")).toBe(81);
    expect(pctWith("done")).toBe(100);
  });

  it("the cycle and day sums use the same credit", () => {
    expect(weightedCycleCounts(tasks, { start: "2026-10-01", end: "2026-10-31" })).toEqual({ done: 1300, total: 3200 });
    expect(weightedCycleCounts(tasks, { start: "2026-11-01", end: "2026-11-30" })).toEqual({ done: 0, total: 0 });
    expect(weightedDayCounts(tasks, "2026-10-10")).toEqual({ done: 1300, total: 3200 });
  });

  it("different sizes weigh differently: a big half-done task outweighs a small done one", () => {
    const small = math("done", { total_count: 5 }); // 100
    const big = math("half_done", { total_count: 100, correct_count: 50 }); // 2000, earns 1000
    expect(completionPercent(weightedCounts([small, big]))).toBe(52); // 1100 / 2100
  });
});

describe("wiring: every surface feeds the rows the credit needs, and none counts one task as one unit", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("the coach's student detail card is on the weighted math (it used to count one unit per task)", () => {
    const page = read("../app/coach/students/[id]/page.tsx");
    expect(page).toContain("weightedCounts(");
    expect(page).not.toMatch(/buckets\.overall\.total \+= 1/);
    expect(page).toContain("total_count, duration_minutes, correct_count, wrong_count, empty_count");
  });

  it("the coach roster, the parent home page and the student board read the solved counts", () => {
    expect(read("../app/coach/students/page.tsx")).toContain("total_count, duration_minutes, correct_count, wrong_count, empty_count");
    expect(read("../app/parent/page.tsx")).toContain("total_count, duration_minutes, correct_count, wrong_count, empty_count");
    expect(read("../app/student/page.tsx")).toContain("total_count, duration_minutes, correct_count, wrong_count, empty_count");
  });

  it("the parent's daily bars get a single solved number, not the Doğru / Yanlış / Boş split", () => {
    const page = read("../app/parent/page.tsx");
    expect(page).toContain("solved_count: solvedCount(");
  });

  it("the Karne's task read already carries the counts", () => {
    expect(read("./karne-summary-data.ts")).toContain("correct_count, wrong_count, empty_count");
  });
});
