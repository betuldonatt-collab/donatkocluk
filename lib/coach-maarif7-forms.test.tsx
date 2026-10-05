import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The coach components import server actions; the rendering tests below never call them.
vi.mock("@/app/coach/actions", () => ({
  saveCoachTrialResults: vi.fn(),
  getTaskTopicMistakesForCoach: vi.fn(() => new Promise(() => {})),
}));

import { TrialResultsSection } from "@/app/coach/students/[id]/_components/kanban/trial-results-section";
import { courseOptionsFor, defaultTaskFormValue, firstCourseIdFor } from "@/app/coach/students/[id]/_components/kanban/task-form-fields";
import type { DetailTask } from "@/app/coach/students/[id]/types";
import { findCourseById, topicOptionsForCourse } from "./curriculum";
import { MAARIF7_EXAM_SUBJECTS } from "./curriculum/subject-groups";
import { normalizeLgsScores } from "./lgs-exam";
import { MAARIF_GRADES } from "./maarif-grade";

const exam = (title: string, over: Partial<DetailTask> = {}) =>
  ({ id: "t1", title, task_type: "general_exam", subject_scores: null, total_count: null, correct_count: null, wrong_count: null, empty_count: null, course_id: null, ...over }) as unknown as DetailTask;

const render = (task: DetailTask) => renderToStaticMarkup(<TrialResultsSection studentId="s1" task={task} onSaved={() => {}} />);

describe("coach: 7th-grade Genel Deneme result form", () => {
  const html = render(exam("7. SINIF Genel Deneme - Test Yayınları"));

  it("is the Sözel / Sayısal grid with the six subjects and their question counts, not one overall entry", () => {
    expect(html.indexOf("Sözel Bölüm")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Sayısal Bölüm")).toBeGreaterThan(html.indexOf("Sözel Bölüm"));
    for (const [label, q] of [["Türkçe", 20], ["Sosyal Bilgiler", 10], ["Din Kültürü", 10], ["İngilizce", 10], ["Matematik", 20], ["Fen Bilimleri", 20]] as const) {
      expect(html).toContain(label);
      expect(html).toContain("(" + q + " soru)");
    }
    expect(html).not.toContain(">Toplam<");
  });

  it("shows the section nets but no puan (the 7th grade has none)", () => {
    expect(html).toContain("Sözel Net");
    expect(html).toContain("Toplam Net");
    expect(html).not.toContain("Yaklaşık Puan");
  });

  it("is seeded from the stored per-subject scores (Boş derived)", () => {
    const seeded = render(exam("7. SINIF Genel Deneme", { subject_scores: { m7_turkce: { correct: 15, wrong: 3, empty: null } } } as Partial<DetailTask>));
    expect(seeded).toContain('value="15"');
    expect(seeded).toContain('value="3"');
  });

  it("LGS keeps its grid with the puan, and the other exams keep the single overall entry", () => {
    const lgs = render(exam("LGS Genel Deneme"));
    expect(lgs).toContain("Yaklaşık Puan");
    expect(lgs).toContain("İnkılap Tarihi");
    const tyt = render(exam("TYT Genel Deneme"));
    expect(tyt).toContain("Toplam");
    expect(tyt).not.toContain("Sözel Bölüm");
    const nineth = render(exam("9. SINIF Genel Deneme"));
    expect(nineth).not.toContain("Sözel Bölüm");
  });
});

describe("saving the coach's 7th-grade results (normalizeLgsScores with the 7th-grade subjects)", () => {
  const rows = (c: number, w: number) => ({ correct: c, wrong: w, empty: null });
  const full = Object.fromEntries(MAARIF7_EXAM_SUBJECTS.map((s) => [s.key, rows(5, 2)]));

  it("accepts the six m7_ rows, derives Boş from each subject's question count and rolls the totals up", () => {
    const res = normalizeLgsScores(full, MAARIF7_EXAM_SUBJECTS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.scores)).toEqual(MAARIF7_EXAM_SUBJECTS.map((s) => s.key));
    expect(res.scores.m7_turkce).toEqual({ correct: 5, wrong: 2, empty: 13 });
    expect(res.totals).toEqual({ total: 90, correct: 30, wrong: 12, empty: 48 });
  });

  it("refuses a missing subject and an over-cap one, naming the subject", () => {
    const { m7_fen: _omit, ...missing } = full;
    void _omit;
    expect(normalizeLgsScores(missing, MAARIF7_EXAM_SUBJECTS).ok).toBe(false);
    const over = normalizeLgsScores({ ...full, m7_din: rows(8, 3) }, MAARIF7_EXAM_SUBJECTS);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain("Din Kültürü");
  });

  it("LGS-keyed rows are not a 7th-grade exam, and the default subject list is still LGS", () => {
    expect(normalizeLgsScores({ lgs_turkce: rows(1, 1) }, MAARIF7_EXAM_SUBJECTS).ok).toBe(false);
    const lgsFull = Object.fromEntries(["lgs_turkce", "lgs_inkilap", "lgs_din", "lgs_ingilizce", "lgs_matematik", "lgs_fen"].map((k) => [k, rows(1, 0)]));
    expect(normalizeLgsScores(lgsFull).ok).toBe(true);
  });
});

describe("coach: task creation form for a 7th grader", () => {
  it("offers the six 7th-grade courses grouped SÖZEL then SAYISAL (and only those), for every task type", () => {
    for (const branch of [false, true]) {
      const options = courseOptionsFor("YKS", branch, 7);
      expect(options.map((o) => [o.label, o.group])).toEqual([
        ["Türkçe", "SÖZEL"],
        ["Sosyal Bilgiler", "SÖZEL"],
        ["Din Kültürü ve Ahlak Bilgisi", "SÖZEL"],
        ["İngilizce", "SÖZEL"],
        ["Matematik", "SAYISAL"],
        ["Fen Bilimleri", "SAYISAL"],
      ]);
    }
  });

  it("starts on Türkçe with a 7th-grade Genel Deneme (title prefix '7. SINIF')", () => {
    expect(firstCourseIdFor("YKS", 7)).toBe("maarif7-turkce");
    const v = defaultTaskFormValue("YKS", 7);
    expect(v.courseId).toBe("maarif7-turkce");
    expect(v.generalExamTrack).toBe("m7");
    expect(MAARIF_GRADES[7].titlePrefix).toBe("7. SINIF");
  });

  it("lists the topics of every 7th-grade course, all resolvable by id (plus Karma)", () => {
    for (const course of MAARIF_GRADES[7].courses) {
      const options = topicOptionsForCourse(course);
      expect(options.length).toBeGreaterThan(1);
      for (const o of options) expect(o.label.trim()).not.toBe("");
      const real = options.filter((o) => o.id !== "karma");
      expect(real).toHaveLength(course.units.flatMap((u) => u.topics).length);
      expect(findCourseById(course.id)).toBe(course);
    }
  });

  it("keeps the other grades' and cohorts' pickers ungrouped / unchanged", () => {
    expect(courseOptionsFor("YKS", false, 9).every((o) => o.group === undefined)).toBe(true);
    expect(courseOptionsFor("LGS", false).some((o) => o.group === "SÖZEL")).toBe(true);
  });
});
