import { describe, expect, it } from "vitest";

import { cardBackgroundClass } from "@/app/coach/students/[id]/_components/kanban/task-card-body";
import { subjectTintClass } from "@/app/student/_components/daily-tasks/types";
import type { DetailTask } from "@/app/coach/students/[id]/types";
import { ROUTINE_COURSES } from "./curriculum";
import { subjectBackgroundClass } from "./subject-colors";

const MATEMATIK_LIGHT = "bg-[var(--subject-matematik)]/6";
const TURKCE_LIGHT = "bg-[var(--subject-turkce)]/6";
const EXPECTED: Record<string, string> = {
  "yeni-nesil-mat-dozu": MATEMATIK_LIGHT,
  problem: MATEMATIK_LIGHT,
  paragraf: TURKCE_LIGHT,
  "kitap-okuma": TURKCE_LIGHT,
};
const ALL_OPTIONS = [{}, { deepMaarif11: true }, { deepLgs: true }, { deepMaarif11: true, deepLgs: true }];

describe("daily routines: their subject's hue, always the lighter (TYT) tier", () => {
  it("covers every routine course", () => {
    expect(ROUTINE_COURSES.map((c) => c.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("Yeni Nesil Mat Dozu and Problem are Matematik, Paragraf and Kitap Okuma are Türkçe, light tier", () => {
    for (const [id, cls] of Object.entries(EXPECTED)) expect(subjectBackgroundClass(id, "question_bank"), id).toBe(cls);
    // the same shade as the regular TYT course of that subject
    expect(subjectBackgroundClass("problem", "question_bank")).toBe(subjectBackgroundClass("tyt-matematik", "question_bank"));
    expect(subjectBackgroundClass("paragraf", "question_bank")).toBe(subjectBackgroundClass("tyt-turkce", "question_bank"));
  });

  it("never the deeper tier, whatever the grade options say (8th grade, 11th grade, both)", () => {
    for (const id of Object.keys(EXPECTED)) {
      for (const options of ALL_OPTIONS) expect(subjectBackgroundClass(id, "question_bank", options), `${id} ${JSON.stringify(options)}`).toBe(EXPECTED[id]);
    }
    // while the regular courses next to them DO go deeper
    expect(subjectBackgroundClass("lgs-matematik", "question_bank", { deepLgs: true })).toBe("bg-[var(--subject-matematik)]/12");
    expect(subjectBackgroundClass("maarif11-matematik", "question_bank", { deepMaarif11: true })).toBe("bg-[var(--subject-matematik)]/12");
  });

  it("whatever task type carries the routine (a reading task, a question bank, an extra)", () => {
    for (const type of ["question_bank", "reading", "topic_study", "extra_custom", "video"]) {
      expect(subjectBackgroundClass("kitap-okuma", type, { deepLgs: true }), type).toBe(TURKCE_LIGHT);
      expect(subjectBackgroundClass("yeni-nesil-mat-dozu", type, { deepMaarif11: true }), type).toBe(MATEMATIK_LIGHT);
    }
  });

  it("no routine is grey or violet any more", () => {
    for (const id of Object.keys(EXPECTED)) {
      expect(subjectBackgroundClass(id, "question_bank")).not.toBe("bg-slate-500/10");
      expect(subjectBackgroundClass(id, "question_bank")).not.toContain("violet");
    }
  });

  it("the same on the coach's, the student's and the parent's boards (one shared function)", () => {
    for (const [id, cls] of Object.entries(EXPECTED)) {
      expect(cardBackgroundClass({ course_id: id, task_type: "question_bank" } as DetailTask), id).toBe(cls);
      expect(subjectTintClass({ course_id: id, task_type: "question_bank" } as never), id).toBe(cls);
      expect(subjectBackgroundClass(id, "question_bank", { deepLgs: true }), id).toBe(cls); // the parent board's own call
    }
  });

  it("everything else is untouched: Genel Deneme, the vocab quiz, a Branş Denemesi, unmapped tasks", () => {
    expect(subjectBackgroundClass(null, "general_exam")).toBe("bg-[var(--subject-genel-deneme)]");
    expect(subjectBackgroundClass("ingilizce-quiz", "vocab_quiz")).toBe("bg-[var(--subject-kimya)]/12");
    expect(subjectBackgroundClass("tyt-matematik", "branch_exam")).toMatch(/\/20$/);
    expect(subjectBackgroundClass(null, "extra_custom")).toBe("bg-slate-500/10");
  });
});
