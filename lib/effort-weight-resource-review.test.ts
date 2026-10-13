import { describe, expect, it } from "vitest";

import { completionPercent } from "./completion";
import { impactPercent, RESOURCE_REVIEW_WEIGHT_MULTIPLIER, subjectCoefficient, taskWeight, weightedDayCounts } from "./effort-weight";

// Kaynak Taraması ("resource_review") weighs 1.5x the Soru Çözümü ("question_bank") it would otherwise be -- on top of the subject
// coefficient, for question counts, duration-only targets and the default alike (user decision, 2026-10-13).

const review = (t: Parameters<typeof taskWeight>[0]) => taskWeight({ ...t, task_type: "resource_review" });
const solve = (t: Parameters<typeof taskWeight>[0]) => taskWeight({ ...t, task_type: "question_bank" });

describe("Kaynak Taraması weight", () => {
  it("is 1.5x the Soru Çözümü for 20 questions, per subject coefficient", () => {
    expect(solve({ course_id: "tyt-turkce", total_count: 20 })).toBe(200);
    expect(review({ course_id: "tyt-turkce", total_count: 20 })).toBe(300);
    expect(solve({ course_id: "tyt-fizik", total_count: 20 })).toBe(300);
    expect(review({ course_id: "tyt-fizik", total_count: 20 })).toBe(450);
    expect(solve({ course_id: "tyt-matematik", total_count: 20 })).toBe(400);
    expect(review({ course_id: "tyt-matematik", total_count: 20 })).toBe(600);
  });

  it("keeps every subject coefficient intact (the ratio between subjects is unchanged)", () => {
    const ratio = (course: string) => review({ course_id: course, total_count: 20 }) / review({ course_id: "tyt-turkce", total_count: 20 });
    expect(ratio("tyt-fizik")).toBe(subjectCoefficient("tyt-fizik"));
    expect(ratio("tyt-matematik")).toBe(subjectCoefficient("tyt-matematik"));
    // biyoloji is still weighed like a verbal subject
    expect(review({ course_id: "tyt-biyoloji", total_count: 20 })).toBe(300);
  });

  it("applies to a duration-only target too (verbal 15 units/min, math 5 units/min)", () => {
    expect(solve({ course_id: "tyt-matematik", duration_minutes: 40 })).toBe(200);
    expect(review({ course_id: "tyt-matematik", duration_minutes: 40 })).toBe(300);
    expect(solve({ course_id: "tyt-turkce", duration_minutes: 40 })).toBe(600);
    expect(review({ course_id: "tyt-turkce", duration_minutes: 40 })).toBe(900);
  });

  it("applies to the default (no amount at all): 150 -> 225", () => {
    expect(solve({ course_id: "tyt-matematik" })).toBe(150);
    expect(review({ course_id: "tyt-matematik" })).toBe(225);
    expect(review({})).toBe(225);
  });

  it("a question count wins over a duration, exactly as for Soru Çözümü (and is still scaled)", () => {
    expect(review({ course_id: "tyt-matematik", total_count: 10, duration_minutes: 999 })).toBe(Math.round(10 * 10 * 2 * 1.5));
  });

  it("the multiplier is exported as 1.5 and nothing else changed: other task types keep their weights", () => {
    expect(RESOURCE_REVIEW_WEIGHT_MULTIPLIER).toBe(1.5);
    expect(taskWeight({ task_type: "question_bank", course_id: "tyt-matematik", total_count: 50 })).toBe(1000);
    expect(taskWeight({ task_type: "video", course_id: "tyt-turkce", duration_minutes: 30 })).toBe(450);
    expect(taskWeight({ task_type: "branch_exam", course_id: "tyt-matematik", total_count: 40 })).toBe(40 * 10 * 2 + 20);
    expect(taskWeight({ task_type: "general_exam", title: "TYT Genel Deneme" })).toBe(1200);
  });
});

describe("effect on a day's bar", () => {
  const day = "2026-10-13";
  const solved = { task_date: day, status: "done", task_type: "question_bank", course_id: "tyt-matematik", total_count: 20 }; // 400
  const reviewPending = { task_date: day, status: "pending", task_type: "resource_review", course_id: "tyt-matematik", total_count: 20 }; // 600

  it("a pending Kaynak Taraması holds the bar down more than an equal Soru Çözümü did (50% -> 40%)", () => {
    const before = [solved, { ...reviewPending, task_type: "question_bank" }];
    const after = [solved, reviewPending];
    expect(completionPercent(weightedDayCounts(before, day))).toBe(50);
    expect(completionPercent(weightedDayCounts(after, day))).toBe(40);
  });

  it("finishing it reaches 100% as before, and a day of only Kaynak Taraması tasks is unchanged by the multiplier", () => {
    expect(completionPercent(weightedDayCounts([solved, { ...reviewPending, status: "done" }], day))).toBe(100);
    const only = [
      { ...reviewPending, status: "done" },
      { ...reviewPending, total_count: 20, course_id: "tyt-turkce" },
    ];
    // 600 done of 600 + 300 = 66.7% -> same as the Soru Çözümü pair 400 of 400 + 200 (the ratio is what matters)
    const onlySolve = only.map((t) => ({ ...t, task_type: "question_bank" }));
    expect(completionPercent(weightedDayCounts(only, day))).toBe(completionPercent(weightedDayCounts(onlySolve, day)));
  });

  it("the 'this task moves your bar by X%' chip uses the same weights", () => {
    // 600 of (400 + 600) = 60%
    expect(impactPercent(reviewPending, [solved, reviewPending])).toBe(60);
    expect(impactPercent({ ...reviewPending, task_type: "question_bank" }, [solved, { ...reviewPending, task_type: "question_bank" }])).toBe(50);
  });
});
