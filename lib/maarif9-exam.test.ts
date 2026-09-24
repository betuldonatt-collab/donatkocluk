import { describe, expect, it } from "vitest";

import { MAARIF9_EXAM_QUESTION_TOTAL, MAARIF9_EXAM_SUBJECTS, coursesForMaarif9ExamSubject } from "./curriculum/subject-groups";
import { findCourseById } from "./curriculum";
import {
  expectedGeneralExamKeys,
  findGeneralExamTotalMismatch,
  isGeneralExamScoresIncomplete,
} from "./exam-results-validation";

const TITLE = "9. SINIF Genel Deneme - 3D Yayınları";

function fullScores(): Record<string, { correct: number; wrong: number; empty: number }> {
  return Object.fromEntries(MAARIF9_EXAM_SUBJECTS.map((s) => [s.key, { correct: s.questions, wrong: 0, empty: 0 }]));
}

describe("9th-grade Genel Deneme", () => {
  it("is the 120-question distribution", () => {
    expect(Object.fromEntries(MAARIF9_EXAM_SUBJECTS.map((s) => [s.label, s.questions]))).toEqual({
      "Türk Dili ve Edebiyatı": 30,
      Tarih: 10,
      Coğrafya: 10,
      "Din Kültürü": 10,
      Matematik: 30,
      Fizik: 10,
      Kimya: 10,
      Biyoloji: 10,
    });
    expect(MAARIF9_EXAM_QUESTION_TOTAL).toBe(120);
  });

  it("uses m9_-prefixed keys that cannot collide with TYT/LGS keys", () => {
    for (const s of MAARIF9_EXAM_SUBJECTS) expect(s.key.startsWith("m9_")).toBe(true);
  });

  it("resolves each subject to its analysis course (and findCourseById can see it)", () => {
    for (const s of MAARIF9_EXAM_SUBJECTS) {
      const courses = coursesForMaarif9ExamSubject(s.key);
      expect(courses).toHaveLength(1);
      expect(findCourseById(courses[0].id)?.id).toBe(courses[0].id);
    }
  });

  it("does not leak into the existing YKS/LGS course lookup", () => {
    expect(findCourseById("tyt-matematik")?.id).toBe("tyt-matematik");
    expect(findCourseById("lgs-matematik")?.id).toBe("lgs-matematik");
    expect(findCourseById("maarif9-matematik")?.id).toBe("maarif9-matematik");
    expect(findCourseById("does-not-exist")).toBeNull();
  });

  it("is validated per subject by the shared exam-results rules", () => {
    expect(expectedGeneralExamKeys(TITLE, null)).toEqual(MAARIF9_EXAM_SUBJECTS.map((s) => s.key));
    expect(isGeneralExamScoresIncomplete(TITLE, fullScores())).toBe(false);
    const missing = fullScores();
    delete missing.m9_fizik;
    expect(isGeneralExamScoresIncomplete(TITLE, missing)).toBe(true);
    expect(findGeneralExamTotalMismatch(TITLE, fullScores())).toBeNull();
    const off = { ...fullScores(), m9_turkce: { correct: 20, wrong: 5, empty: 0 } }; // 25, not 30
    expect(findGeneralExamTotalMismatch(TITLE, off)).toEqual({ label: "Türk Dili ve Edebiyatı", questions: 30 });
  });

  it("leaves TYT and LGS titles resolving exactly as before", () => {
    expect(expectedGeneralExamKeys("TYT Genel Deneme", null)).toEqual(["turkce", "sosyal", "matematik", "fen"]);
    expect(expectedGeneralExamKeys("LGS Genel Deneme", null)).toContain("lgs_turkce");
  });
});
