import { describe, expect, it } from "vitest";

import { lgsCompletionProblem } from "./lgs-completion";
import { findMissingTasks, type MissingTaskInput } from "./missing-tasks";
import { usesPhotoWorkflow } from "./photo-workflow";

describe("usesPhotoWorkflow: who needs a Kanıt Fotoğrafı", () => {
  it("LGS students and 7th graders do; YKS and the other Maarif grades do not", () => {
    expect(usesPhotoWorkflow({ examType: "LGS", maarifGrade: null })).toBe(true);
    expect(usesPhotoWorkflow({ examType: "YKS", maarifGrade: 7 })).toBe(true);
    expect(usesPhotoWorkflow({ examType: "YKS", maarifGrade: null })).toBe(false);
    for (const g of [9, 10, 11]) expect(usesPhotoWorkflow({ examType: "YKS", maarifGrade: g })).toBe(false);
    expect(usesPhotoWorkflow({ examType: null, maarifGrade: undefined })).toBe(false);
  });
});

describe("the completion rules a 7th grader now goes through (the LGS ones)", () => {
  const base = { title: "x", photoCount: 0, correct: null, wrong: null, empty: null, subjectScores: null };

  it("every task type but Kitap Okuma (and the vocab quiz) needs at least one photo", () => {
    for (const taskType of ["question_bank", "branch_exam", "general_exam", "topic_study", "video", "extra_custom"]) {
      expect(lgsCompletionProblem({ ...base, taskType }), taskType).toContain("kanıt fotoğrafı");
    }
  });

  it("Kitap Okuma is exempt from the photo: its page range is the proof", () => {
    expect(lgsCompletionProblem({ ...base, taskType: "reading", correct: 30 })).toBeNull();
    expect(lgsCompletionProblem({ ...base, taskType: "reading" })).toContain("sayfa");
  });

  it("with a photo, Soru Çözümü / Branş Denemesi still need Doğru / Yanlış / Boş", () => {
    expect(lgsCompletionProblem({ ...base, taskType: "question_bank", photoCount: 1 })).toContain("doğru, yanlış ve boş");
    expect(lgsCompletionProblem({ ...base, taskType: "question_bank", photoCount: 1, correct: 5, wrong: 1, empty: 0 })).toBeNull();
    expect(lgsCompletionProblem({ ...base, taskType: "topic_study", photoCount: 1 })).toBeNull();
  });

  it("a 7th-grade Genel Deneme needs a full row for each of its six subjects", () => {
    const title = "7. SINIF Genel Deneme";
    expect(lgsCompletionProblem({ ...base, title, taskType: "general_exam", photoCount: 1, subjectScores: { m7_turkce: { correct: 1, wrong: 0, empty: 19 } } })).toContain("tüm derslerin");
    const full = Object.fromEntries(["m7_turkce", "m7_sosyal", "m7_din", "m7_ingilizce", "m7_matematik", "m7_fen"].map((k) => [k, { correct: 0, wrong: 0, empty: 0 }]));
    expect(lgsCompletionProblem({ ...base, title, taskType: "general_exam", photoCount: 1, subjectScores: full })).toBeNull();
  });
});

describe("the coach's missing-task list for a photo-workflow student", () => {
  const task = (over: Record<string, unknown>) => ({
    id: "t1",
    task_date: "2026-10-01",
    task_type: "topic_study",
    course_id: "maarif7-matematik",
    title: "x",
    status: "pending",
    is_approved_by_coach: true,
    evidence_image_paths: [] as string[],
    evidence_review_status: "none",
    ...over,
  });

  it("flags a past-due task without a photo, but never a Kitap Okuma one", () => {
    const missing = findMissingTasks([task({}) as unknown as MissingTaskInput, task({ id: "t2", task_type: "reading", course_id: "kitap-okuma" }) as unknown as MissingTaskInput], "2026-10-06", { requiresPhoto: true });
    expect(missing.map((m) => m.task.id)).toEqual(["t1"]);
  });
});
