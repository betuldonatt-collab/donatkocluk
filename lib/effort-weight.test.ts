import { describe, expect, it } from "vitest";

import { completionPercent } from "./completion";
import { impactPercent, subjectCoefficient, taskWeight, weightedCompletionCounts, weightedWeekCompletionCounts } from "./effort-weight";

describe("subjectCoefficient", () => {
  it("maps subjects to 1 / 1.5 / 2", () => {
    expect(subjectCoefficient("tyt-turkce")).toBe(1);
    expect(subjectCoefficient("ayt-felsefe")).toBe(1);
    expect(subjectCoefficient("lgs-ingilizce")).toBe(1);
    expect(subjectCoefficient("paragraf")).toBe(1);
    expect(subjectCoefficient(null)).toBe(1);
    expect(subjectCoefficient("tyt-fizik")).toBe(1.5);
    expect(subjectCoefficient("ayt-biyoloji")).toBe(1.5);
    expect(subjectCoefficient("lgs-fen-bilimleri")).toBe(1.5);
    expect(subjectCoefficient("tyt-fen-macro")).toBe(1.5);
    expect(subjectCoefficient("tyt-matematik")).toBe(2);
    expect(subjectCoefficient("ayt-geometri-ea")).toBe(2);
    expect(subjectCoefficient("problem")).toBe(2);
    expect(subjectCoefficient("yeni-nesil-mat-dozu")).toBe(2);
  });
});

describe("taskWeight", () => {
  it("scales question banks by subject", () => {
    expect(taskWeight({ task_type: "question_bank", course_id: "tyt-turkce", total_count: 20 })).toBe(200);
    expect(taskWeight({ task_type: "question_bank", course_id: "tyt-fizik", total_count: 20 })).toBe(300);
    expect(taskWeight({ task_type: "question_bank", course_id: "tyt-matematik", total_count: 50 })).toBe(1000);
  });

  it("weighs 20 paragraphs less than 50 geometry questions", () => {
    const p = taskWeight({ task_type: "question_bank", course_id: "paragraf", total_count: 20 });
    const g = taskWeight({ task_type: "question_bank", course_id: "tyt-geometri", total_count: 50 });
    expect(g).toBeGreaterThan(p);
  });

  it("uses minutes for video/topic study, default 30 min when unset", () => {
    expect(taskWeight({ task_type: "video", duration_minutes: 40 })).toBe(200);
    expect(taskWeight({ task_type: "topic_study", duration_minutes: null })).toBe(150);
    expect(taskWeight({ task_type: "video", duration_minutes: 0 })).toBe(150);
  });

  it("scales branch exams by question count and coefficient plus a small bonus", () => {
    const bio6 = taskWeight({ task_type: "branch_exam", course_id: "tyt-biyoloji", total_count: 6 });
    const fen20 = taskWeight({ task_type: "branch_exam", course_id: "tyt-fen-macro", total_count: 20 });
    expect(bio6).toBe(6 * 15 + 20);
    expect(fen20).toBe(20 * 15 + 20);
    expect(fen20).toBeGreaterThan(bio6);
  });

  it("gives general exams a large milestone weight", () => {
    expect(taskWeight({ task_type: "general_exam", title: "TYT Genel Deneme" })).toBe(1200);
    expect(taskWeight({ task_type: "general_exam", title: "LGS Genel Deneme" })).toBe(900);
  });

  it("falls back to the default for legacy rows with no amount", () => {
    expect(taskWeight({ task_type: "question_bank", course_id: "tyt-matematik", total_count: null })).toBe(150);
    expect(taskWeight({})).toBe(150);
  });
});

describe("weighted completion", () => {
  const WED = "2026-09-23";
  const tasks = [
    { task_date: "2026-09-22", status: "done", task_type: "question_bank", course_id: "tyt-matematik", total_count: 50 }, // 1000
    { task_date: "2026-09-23", status: "pending", task_type: "question_bank", course_id: "paragraf", total_count: 20 }, // 200
    { task_date: "2026-09-25", status: "pending", task_type: "video", duration_minutes: 30 }, // 150
  ];

  it("counts effort, not tasks, through today", () => {
    const c = weightedCompletionCounts(tasks, WED);
    expect(c).toEqual({ done: 1000, total: 1200 });
    expect(completionPercent(c)).toBe(83);
  });

  it("uses the whole week for the macro view", () => {
    const c = weightedWeekCompletionCounts(tasks, WED);
    expect(c.total).toBe(1350);
    expect(completionPercent(c)).toBe(74);
  });
});

describe("impactPercent", () => {
  it("is the task's share of its day", () => {
    const a = { task_date: "d", status: "pending", task_type: "question_bank", course_id: "tyt-turkce", total_count: 30 }; // 300
    const b = { task_date: "d", status: "pending", task_type: "question_bank", course_id: "tyt-turkce", total_count: 70 }; // 700
    expect(impactPercent(a, [a, b])).toBe(30);
    expect(impactPercent(a, [])).toBeNull();
  });
});
