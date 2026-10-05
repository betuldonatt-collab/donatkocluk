import { describe, expect, it } from "vitest";

import { findCourseById, isMaarifCourseId } from "./curriculum";
import { isMaarif7CourseId, MAARIF7_KAYNAK_COURSES } from "./curriculum/maarif7";
import { expectedGeneralExamKeys, isGeneralExamScoresIncomplete } from "./exam-results-validation";
import {
  fetchMaarifGrade,
  fetchMaarifGradesByIds,
  fetchRequestedMaarifGrade,
  gradeFromFlags,
  gradeOfTrack,
  MAARIF_GRADES,
} from "./maarif-grade";
import { DEFAULT_SCHOOL_COURSES, schoolCohortOf } from "./school-exams";
import { isStudentNavItemVisible } from "./student-nav";
import { pipelineConfigFor, validatePipelineStep } from "./topic-pipeline";

describe("7th grade is a Maarif-style grade, with its curriculum still to come", () => {
  it("has its own entry in the grade table: label, track, exam-title prefix", () => {
    const g = MAARIF_GRADES[7];
    expect(g.label).toBe("7. Sınıf");
    expect(g.track).toBe("m7");
    expect(g.titlePrefix).toBe("7. SINIF");
    expect(gradeOfTrack("m7")).toBe(7);
  });

  it("is an empty placeholder: no courses and no Genel Deneme subjects yet, resolved safely", () => {
    expect(MAARIF7_KAYNAK_COURSES).toEqual([]);
    expect(MAARIF_GRADES[7].courses).toEqual([]);
    expect(MAARIF_GRADES[7].examSubjects).toEqual([]);
    expect(MAARIF_GRADES[7].coursesForExamSubject("anything")).toEqual([]);
    expect(findCourseById("maarif7-matematik")).toBeNull();
  });

  it("recognises only maarif7- course ids as its own, and counts them as Maarif courses", () => {
    expect(isMaarif7CourseId("maarif7-matematik")).toBe(true);
    expect(MAARIF_GRADES[7].isCourseId("maarif7-fen")).toBe(true);
    for (const id of ["maarif9-matematik", "maarif10-matematik", "maarif11-matematik", "lgs-matematik", "tyt-matematik", null]) {
      expect(isMaarif7CourseId(id)).toBe(false);
    }
    expect(MAARIF_GRADES[9].isCourseId("maarif7-matematik")).toBe(false);
    expect(isMaarifCourseId("maarif7-matematik")).toBe(true);
  });

  it("reads the grade from the flag columns, 7 included, and never mixes grades", () => {
    expect(gradeFromFlags({ is_maarif7: true })).toBe(7);
    expect(gradeFromFlags({ is_maarif7: false, is_maarif9: false, is_maarif10: false, is_maarif11: false })).toBeNull();
    expect(gradeFromFlags({ is_maarif7: true, is_maarif9: false })).toBe(7);
    expect(gradeFromFlags({ is_maarif9: true })).toBe(9); // is_maarif7 column missing (pre-migration)
    expect(gradeFromFlags(null)).toBeNull();
  });

  it("uses the Maarif pipeline and refuses another grade's courses", () => {
    expect(pipelineConfigFor("YKS", 7)).toEqual(pipelineConfigFor("YKS", 9));
    const step = { courseId: "maarif9-matematik", topicId: "maarif9-matematik-u0-t0", step: "konu_calismasi" as const, value: true };
    expect(() => validatePipelineStep("YKS", step, 7)).toThrow("Geçersiz ders.");
  });
});

describe("7th grade exam titles", () => {
  it("a 7th grader's Genel Deneme has no fixed subject list yet and is never judged by TYT's", () => {
    const title = "7. SINIF Genel Deneme - Test Yayınları";
    expect(expectedGeneralExamKeys(title, null)).toEqual([]);
    expect(isGeneralExamScoresIncomplete(title, { matematik: { correct: 1, wrong: 0, empty: 0 } })).toBe(false);
  });
});

describe("the 7th grade's menu", () => {
  const seventh = { examType: "YKS" as const, isMaarif: true, isGraduate: false };

  it("keeps Kaynak Takibi, Deneme Analizleri and Yazılılar; hides Çıkmış Sorular and İngilizce Quiz", () => {
    expect(isStudentNavItemVisible("/student/kaynak-takibi", seventh)).toBe(true);
    expect(isStudentNavItemVisible("/student/deneme-analizleri", seventh)).toBe(true);
    expect(isStudentNavItemVisible("/student/yazililar", seventh)).toBe(true);
    expect(isStudentNavItemVisible("/student/paragraf-problem", seventh)).toBe(true);
    expect(isStudentNavItemVisible("/student/cikmis-sorular", seventh)).toBe(false);
    expect(isStudentNavItemVisible("/student/ingilizce-quiz", seventh)).toBe(false);
  });
});

describe("Yazılılar for the 7th grade", () => {
  it("has its own cohort with the six courses, in order", () => {
    expect(schoolCohortOf({ examType: "YKS", maarifGrade: 7, isGraduate: false })).toBe("grade7");
    expect(DEFAULT_SCHOOL_COURSES.grade7.map((c) => c.name)).toEqual([
      "Matematik",
      "Türkçe",
      "Fen Bilimleri",
      "Sosyal Bilgiler",
      "İngilizce",
      "Din Kültürü ve Ahlak Bilgisi",
    ]);
  });

  it("keeps every other grade's cohort unchanged", () => {
    expect(schoolCohortOf({ examType: "LGS", maarifGrade: null, isGraduate: false })).toBe("lgs");
    expect(schoolCohortOf({ examType: "YKS", maarifGrade: 9, isGraduate: false })).toBe("grade9");
    expect(schoolCohortOf({ examType: "YKS", maarifGrade: null, isGraduate: false })).toBe("grade12");
  });
});

// A minimal stand-in for the Supabase client: the first N column sets "fail" like a column that
// does not exist yet, so the tolerant reads have to fall back.
function fakeSupabase(failColumnSets: string[], row: Record<string, unknown>) {
  const calls: string[] = [];
  const query = (columns: string) => {
    calls.push(columns);
    const fail = failColumnSets.includes(columns);
    const result = fail ? { data: null, error: { message: "column does not exist" } } : { data: row, error: null };
    const listResult = fail ? { data: null, error: { message: "column does not exist" } } : { data: [{ id: "a", ...row }], error: null };
    const chain = {
      eq: () => chain,
      in: () => Promise.resolve(listResult),
      maybeSingle: () => Promise.resolve(result),
    };
    return chain;
  };
  return { calls, client: { from: () => ({ select: query }) } as never };
}

describe("tolerant reads of the grade flag (migration 0119 may not be applied yet)", () => {
  const ALL4 = "is_maarif7, is_maarif9, is_maarif10, is_maarif11";
  const ALL3 = "is_maarif9, is_maarif10, is_maarif11";

  it("reads a 7th grader when all four columns exist", async () => {
    const { client } = fakeSupabase([], { is_maarif7: true });
    expect(await fetchMaarifGrade(client, "s")).toBe(7);
    expect(await fetchRequestedMaarifGrade(client, "r")).toBe(7);
  });

  it("falls back to the older columns when is_maarif7 does not exist yet, and still reads the 9th grade", async () => {
    const { client, calls } = fakeSupabase([ALL4], { is_maarif9: true });
    expect(await fetchMaarifGrade(client, "s")).toBe(9);
    expect(calls).toEqual([ALL4, ALL3]);
  });

  it("an ordinary student reads as no grade even when every column is missing", async () => {
    const { client } = fakeSupabase([ALL4, ALL3, "is_maarif9, is_maarif10", "is_maarif9"], {});
    expect(await fetchMaarifGrade(client, "s")).toBeNull();
  });

  it("the list read maps flagged rows to their grade, 7 included", async () => {
    const { client } = fakeSupabase([], { is_maarif7: true });
    const grades = await fetchMaarifGradesByIds(client, "profiles", ["a"]);
    expect(grades.get("a")).toBe(7);
  });
});
