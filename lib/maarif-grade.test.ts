import { describe, expect, it } from "vitest";

import { findCourseById } from "./curriculum";
import { MAARIF10_EXAM_QUESTION_TOTAL, MAARIF10_EXAM_SUBJECTS, coursesForMaarif10ExamSubject } from "./curriculum/subject-groups";
import { expectedGeneralExamKeys, findGeneralExamTotalMismatch, isGeneralExamScoresIncomplete } from "./exam-results-validation";
import { taskWeight } from "./effort-weight";
import { MAARIF_GRADES, gradeFromFlags, gradeOfTrack, stripGradePrefix } from "./maarif-grade";
import { subjectBackgroundClass } from "./subject-colors";
import { validatePipelineStep } from "./topic-pipeline";

const TITLE10 = "10. SINIF Genel Deneme - 3D Yayınları";

describe("grade separation (9th vs 10th)", () => {
  it("each grade offers only its own courses and exam subjects", () => {
    for (const c of MAARIF_GRADES[9].courses) expect(c.id.startsWith("maarif9-")).toBe(true);
    for (const c of MAARIF_GRADES[10].courses) expect(c.id.startsWith("maarif10-")).toBe(true);
    for (const s of MAARIF_GRADES[9].examSubjects) expect(s.key.startsWith("m9_")).toBe(true);
    for (const s of MAARIF_GRADES[10].examSubjects) expect(s.key.startsWith("m10_")).toBe(true);
    expect(MAARIF_GRADES[9].isCourseId("maarif10-matematik")).toBe(false);
    expect(MAARIF_GRADES[10].isCourseId("maarif9-matematik")).toBe(false);
    expect(MAARIF_GRADES[10].isCourseId("maarif10-matematik")).toBe(true);
  });

  it("topic-pipeline ticks accept only the student's own grade's courses", () => {
    const nine = MAARIF_GRADES[9].courses[0];
    const ten = MAARIF_GRADES[10].courses[0];
    const input = (course: { id: string; units: { topics: { id: string }[] }[] }) => ({
      courseId: course.id,
      topicId: course.units[0].topics[0].id,
      step: "konu_calismasi",
      value: true,
    });
    expect(() => validatePipelineStep("YKS", input(nine) as never, 9)).not.toThrow();
    expect(() => validatePipelineStep("YKS", input(ten) as never, 10)).not.toThrow();
    expect(() => validatePipelineStep("YKS", input(ten) as never, 9)).toThrow("Geçersiz ders.");
    expect(() => validatePipelineStep("YKS", input(nine) as never, 10)).toThrow("Geçersiz ders.");
    expect(() => validatePipelineStep("YKS", input(nine) as never, null)).toThrow("Geçersiz ders.");
    expect(() => validatePipelineStep("YKS", input(ten) as never, null)).toThrow("Geçersiz ders.");
  });

  it("reads the grade from the flag columns (10 wins only if set; both never expected)", () => {
    expect(gradeFromFlags(null)).toBeNull();
    expect(gradeFromFlags({ is_maarif9: false, is_maarif10: false })).toBeNull();
    expect(gradeFromFlags({ is_maarif9: true, is_maarif10: false })).toBe(9);
    expect(gradeFromFlags({ is_maarif9: false, is_maarif10: true })).toBe(10);
    expect(gradeFromFlags({ is_maarif9: true })).toBe(9); // is_maarif10 column missing (0099 pending)
  });

  it("maps exam tracks to grades and strips the prefix for labels", () => {
    expect(gradeOfTrack("m9")).toBe(9);
    expect(gradeOfTrack("m10")).toBe(10);
    expect(gradeOfTrack("tyt")).toBeNull();
    expect(stripGradePrefix("9. Sınıf Matematik")).toBe("Matematik");
    expect(stripGradePrefix("10. Sınıf Din Kültürü ve Ahlak Bilgisi")).toBe("Din Kültürü ve Ahlak Bilgisi");
  });

  it("findCourseById resolves both grades' stored courses", () => {
    expect(findCourseById("maarif9-matematik")?.name).toBe("9. Sınıf Matematik");
    expect(findCourseById("maarif10-matematik")?.name).toBe("10. Sınıf Matematik");
    expect(findCourseById("maarif10-gd-felsefe")?.name).toBe("Felsefe");
  });
});

describe("10th-grade Genel Deneme (120 questions)", () => {
  it("has the agreed distribution", () => {
    expect(Object.fromEntries(MAARIF10_EXAM_SUBJECTS.map((s) => [s.label, s.questions]))).toEqual({
      "Türk Dili ve Edebiyatı": 30,
      Tarih: 10,
      Coğrafya: 10,
      Felsefe: 5,
      "Din Kültürü ve Ahlak Bilgisi": 5,
      Matematik: 30,
      Fizik: 10,
      Kimya: 10,
      Biyoloji: 10,
    });
    expect(MAARIF10_EXAM_QUESTION_TOTAL).toBe(120);
  });

  it("resolves every subject to its own analysis course", () => {
    for (const s of MAARIF10_EXAM_SUBJECTS) {
      const courses = coursesForMaarif10ExamSubject(s.key);
      expect(courses).toHaveLength(1);
      expect(courses[0].id.startsWith("maarif10-gd-")).toBe(true);
    }
  });

  it("is validated per subject by the shared exam-results rules", () => {
    const full = Object.fromEntries(MAARIF10_EXAM_SUBJECTS.map((s) => [s.key, { correct: s.questions, wrong: 0, empty: 0 }]));
    expect(expectedGeneralExamKeys(TITLE10, null)).toEqual(MAARIF10_EXAM_SUBJECTS.map((s) => s.key));
    expect(isGeneralExamScoresIncomplete(TITLE10, full)).toBe(false);
    expect(findGeneralExamTotalMismatch(TITLE10, full)).toBeNull();
    const off = { ...full, m10_felsefe: { correct: 3, wrong: 1, empty: 0 } }; // 4, not 5
    expect(findGeneralExamTotalMismatch(TITLE10, off)).toEqual({ label: "Felsefe", questions: 5 });
  });

  it("does not confuse the 9th and 10th grade titles", () => {
    expect(expectedGeneralExamKeys("9. SINIF Genel Deneme", null)?.[0]).toBe("m9_turkce");
    expect(expectedGeneralExamKeys("10. SINIF Genel Deneme", null)?.[0]).toBe("m10_turkce");
  });
});

describe("10th-grade colours and effort weights reuse the existing rules", () => {
  it("colours match the same subject elsewhere", () => {
    const pairs: [string, string][] = [
      ["maarif10-matematik", "tyt-matematik"],
      ["maarif10-fizik", "tyt-fizik"],
      ["maarif10-felsefe", "tyt-felsefe"],
      ["maarif10-din-kulturu-ve-ahlak-bilgisi", "tyt-din"],
      ["maarif10-turk-dili-ve-edebiyati", "tyt-turkce"],
      ["maarif10-gd-biyoloji", "tyt-biyoloji"],
    ];
    for (const [ten, existing] of pairs) {
      expect(subjectBackgroundClass(ten, "question_bank")).toBe(subjectBackgroundClass(existing, "question_bank"));
      expect(subjectBackgroundClass(ten, "question_bank")).not.toBe("bg-slate-500/10");
    }
  });

  it("weights follow the subject coefficients (engine untouched)", () => {
    const w = (id: string) => taskWeight({ task_type: "question_bank", course_id: id, total_count: 10 });
    expect(w("maarif10-matematik")).toBe(200);
    expect(w("maarif10-fizik")).toBe(150);
    expect(w("maarif10-felsefe")).toBe(100);
    expect(w("maarif10-din-kulturu-ve-ahlak-bilgisi")).toBe(100);
  });
});
