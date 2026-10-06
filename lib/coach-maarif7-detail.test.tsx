import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The coach tabs import server actions; nothing below calls them.
vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/coach/school-exam-actions", () => ({ decideCourseRemoval: vi.fn() }));
vi.mock("@/app/coach/school-grade-actions", () => ({ saveSchoolGradeForStudent: vi.fn(), setSchoolGradeLock: vi.fn() }));
vi.mock("@/app/coach/events/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));

import { ChartsTab } from "@/app/coach/students/[id]/_components/charts-tab";
import { DetailTabs } from "@/app/coach/students/[id]/_components/detail-tabs";
import type { DetailTask } from "@/app/coach/students/[id]/types";
import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import { curriculumCourseIdsFor, MAARIF7_CURRICULUM_COURSE_IDS, YKS_CURRICULUM_COURSE_IDS } from "./curriculum/cohort";
import { computeGelisimHaritasi } from "./gelisim-haritasi";
import { computeAylikKarne, computeLgsScoreBreakdown, computeMaarif7ScoreBreakdown, computeNetSummary, type KarneGeneralExam } from "./karne";
import type { MaarifGrade } from "./maarif-grade";

const row = (correct: number, wrong: number, empty = 0) => ({ correct, wrong, empty });
const m7Scores = {
  m7_turkce: row(15, 3, 2), // net 14
  m7_sosyal: row(9, 0, 1), // 9
  m7_din: row(6, 3, 1), // 5
  m7_ingilizce: row(10, 0), // 10
  m7_matematik: row(12, 6, 2), // 10
  m7_fen: row(18, 0, 2), // 18
};
const m7Exam = (date = "2026-10-01"): KarneGeneralExam => ({ task_date: date, title: "7. SINIF Genel Deneme - X", subject_scores: m7Scores });

describe("7th-grade analytics cohort", () => {
  it("covers the six maarif7 courses, in the Sözel-then-Sayısal order, not the YKS list", () => {
    expect(curriculumCourseIdsFor("YKS", 7)).toBe(MAARIF7_CURRICULUM_COURSE_IDS);
    expect(MAARIF7_CURRICULUM_COURSE_IDS).toEqual([
      "maarif7-turkce",
      "maarif7-sosyal-bilgiler",
      "maarif7-din-kulturu-ve-ahlak-bilgisi",
      "maarif7-ingilizce",
      "maarif7-matematik",
      "maarif7-fen-bilimleri",
    ]);
  });

  it("leaves YKS, LGS and the 11th grade as before (9th and 10th have their own courses now)", () => {
    expect(curriculumCourseIdsFor("YKS")).toBe(YKS_CURRICULUM_COURSE_IDS);
    expect(curriculumCourseIdsFor("YKS", 11)).toBe(YKS_CURRICULUM_COURSE_IDS);
    expect(curriculumCourseIdsFor("YKS", 9)).not.toBe(YKS_CURRICULUM_COURSE_IDS); // the 9th grade has its own courses now
    expect(curriculumCourseIdsFor("LGS").some((id) => id.startsWith("lgs-"))).toBe(true);
  });
});

describe("7th-grade Gelişim Haritası / Karne topic tracking maps to the maarif7 topics", () => {
  const exam = { id: "e1", task_date: "2026-10-01", task_type: "general_exam", course_id: null };
  const mistakes = [
    { task_id: "e1", course_id: "maarif7-turkce", topic_id: "maarif7-turkce-u1-t1" },
    { task_id: "e1", course_id: "maarif7-fen-bilimleri", topic_id: "maarif7-fen-bilimleri-u0-t0" },
  ];

  it("a 7th-grade general exam counts toward each of the six courses, and a mistake lands on its own topic", () => {
    const rows = computeGelisimHaritasi(MAARIF7_CURRICULUM_COURSE_IDS, [exam], mistakes);
    expect(new Set(rows.map((r) => r.courseId))).toEqual(new Set(MAARIF7_CURRICULUM_COURSE_IDS));
    expect(rows.every((r) => r.windowSize === 1)).toBe(true);
    expect(rows.filter((r) => r.count === 1).map((r) => r.topicId).sort()).toEqual(["maarif7-fen-bilimleri-u0-t0", "maarif7-turkce-u1-t1"]);
    expect(rows.find((r) => r.topicId === "maarif7-turkce-u1-t1")?.topicName).toBe("Fiillerde Kip (Haber ve Dilek Kipleri)");
  });

  it("the Karne's Konu Bazlı Hata Sıklığı does the same over the cycle's date range", () => {
    const inRange = computeAylikKarne(MAARIF7_CURRICULUM_COURSE_IDS, [exam], mistakes, "2026-09-20", "2026-10-17");
    expect(inRange.every((r) => r.windowSize === 1)).toBe(true);
    expect(inRange.filter((r) => r.count === 1)).toHaveLength(2);
    const outOfRange = computeAylikKarne(MAARIF7_CURRICULUM_COURSE_IDS, [exam], mistakes, "2026-08-01", "2026-08-28");
    expect(outOfRange.every((r) => r.windowSize === 0 && r.count === 0)).toBe(true);
  });
});

describe("7th-grade Karne scores", () => {
  it("averages the 7th-grade general exams' net with 3 yanlış 1 doğruyu götürür, separately from LGS and TYT", () => {
    const net = computeNetSummary([m7Exam(), m7Exam("2026-10-08")], "2026-09-20", "2026-10-17");
    expect(net.m7).toBe(66); // 14 + 9 + 5 + 10 + 10 + 18
    expect(net.lgs).toBeNull();
    expect(net.tyt).toBeNull();
    expect(computeNetSummary([{ ...m7Exam(), title: "LGS Genel Deneme" }], "2026-09-20", "2026-10-17").m7).toBeNull();
  });

  it("rolls the six m7_ subjects' D/Y/B up per subject and in total, plus course-tagged practice", () => {
    const practice = [{ task_date: "2026-10-02", course_id: "maarif7-matematik", correct_count: 20, wrong_count: 4, empty_count: 1 }];
    const b = computeMaarif7ScoreBreakdown(practice, [m7Exam()], "2026-09-20", "2026-10-17");
    expect(b.bySubject.map((s) => s.label)).toEqual(["Türkçe", "Sosyal Bilgiler", "Din Kültürü", "İngilizce", "Matematik", "Fen Bilimleri"]);
    expect(b.bySubject.find((s) => s.key === "m7_matematik")).toMatchObject({ correct: 32, wrong: 10, empty: 3 });
    expect(b.total).toEqual({ correct: 90, wrong: 16, empty: 9 });
  });

  it("the LGS breakdown is unchanged: LGS rows only, and a 7th-grade exam is not an LGS exam", () => {
    const b = computeLgsScoreBreakdown([], [m7Exam()], "2026-09-20", "2026-10-17");
    expect(b.bySubject.map((s) => s.key)).toEqual(["lgs_turkce", "lgs_inkilap", "lgs_din", "lgs_ingilizce", "lgs_matematik", "lgs_fen"]);
    expect(b.total).toEqual({ correct: 0, wrong: 0, empty: 0 });
  });
});

describe("the coach's detail page tabs", () => {
  const tabsOf = (grade: MaarifGrade | null) =>
    renderToStaticMarkup(
      <MaarifGradeProvider value={grade}>
        <DetailTabs
          studentId="s1"
          topicPerformance={[]}
          curriculumCourseIds={[]}
          paragrafEntries={[]}
          generalExams={[]}
          branchExams={[]}
          examMistakes={[]}
          initialWeekDays={[]}
          initialWeekTasks={[]}
          initialFixedTasks={[]}
          courseResourceData={{}}
          today="2026-10-06"
          initialWeekStats={[]}
          karneCycles={[]}
          defaultKarneRange={null}
          allTimeTrackedMinutes={0}
          initialTab="gorusmeler"
          sessions={[]}
        />
      </MaarifGradeProvider>,
    );

  it("a 7th grader sees Gelişim Haritası, Grafikler and Karneler like everyone else (nothing hidden)", () => {
    const html = tabsOf(7);
    for (const label of ["Analiz", "Gelişim Haritası", "Grafikler", "Program", "Kaynak Takibi", "Karneler", "Görüşmeler"]) expect(html).toContain(">" + label + "<");
  });

  it("the other Maarif grades keep those three hidden", () => {
    for (const grade of [9, 10] as const) {
      const html = tabsOf(grade);
      for (const label of ["Gelişim Haritası", "Grafikler", "Karneler"]) expect(html).not.toContain(">" + label + "<");
      expect(html).toContain(">Analiz<");
    }
  });
});

describe("the 7th grader's Grafikler", () => {
  const exam = { id: "g1", task_date: "2026-10-01", title: "7. SINIF Genel Deneme - X", task_type: "general_exam", subject_scores: m7Scores } as unknown as DetailTask;
  const html = renderToStaticMarkup(
    <MaarifGradeProvider value={7}>
      <ChartsTab studentId="s1" examMistakes={[]} weekDays={[]} courseResourceData={{}} paragrafEntries={[]} generalExams={[exam]} branchExams={[]} chartRange={{ type: "custom", startDate: "2026-09-01", endDate: "2026-10-31" }} />
    </MaarifGradeProvider>,
  );

  it("lists the 7th-grade exam in the Genel Deneme Geçmişi with the 3:1 net of the six subjects (66)", () => {
    expect(html).toContain("7. SINIF Genel Deneme - X");
    expect(html).toContain("66.00");
  });

  it("charts the six 7th-grade subjects, with no TYT/AYT toggle", () => {
    for (const label of ["Türkçe", "Sosyal Bilgiler", "Din Kültürü", "İngilizce", "Matematik", "Fen Bilimleri"]) expect(html).toContain(label);
    expect(html).not.toContain(">TYT<");
    expect(html).not.toContain(">AYT<");
  });
});
