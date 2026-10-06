import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/coach/school-exam-actions", () => ({ decideCourseRemoval: vi.fn() }));
vi.mock("@/app/coach/school-grade-actions", () => ({ saveSchoolGradeForStudent: vi.fn(), setSchoolGradeLock: vi.fn() }));
vi.mock("@/app/coach/events/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/student/deneme-analizleri/genel", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import DenemeAnalizleriLayout from "@/app/student/deneme-analizleri/layout";
import { DetailTabs } from "@/app/coach/students/[id]/_components/detail-tabs";
import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import { findCourseById } from "./curriculum";
import { curriculumCourseIdsFor, generalExamCourseIdsForTitle, MAARIF11_CURRICULUM_COURSE_IDS, YKS_CURRICULUM_COURSE_IDS } from "./curriculum/cohort";
import { MAARIF_TYT_MERGED_COURSES } from "./curriculum/maarif-tyt";
import { computeGelisimHaritasi } from "./gelisim-haritasi";
import type { MaarifGrade } from "./maarif-grade";

describe("11th grade: what the Gelişim Haritası covers", () => {
  it("its own eight courses and the ten Maarif TYT courses -- not the standard TYT / AYT list that matched none of its data", () => {
    const ids = curriculumCourseIdsFor("YKS", 11);
    expect(ids).toBe(MAARIF11_CURRICULUM_COURSE_IDS);
    expect(ids.filter((id) => id.startsWith("maarif11-"))).toHaveLength(8);
    expect(ids.filter((id) => id.startsWith("maarif-tyt-"))).toEqual(MAARIF_TYT_MERGED_COURSES.map((c) => c.id));
    expect(ids.some((id) => id.startsWith("tyt-") || id.startsWith("ayt-"))).toBe(false);
    for (const id of ids) expect(findCourseById(id), id).not.toBeNull();
  });

  it("every other cohort keeps its list", () => {
    expect(curriculumCourseIdsFor("YKS")).toBe(YKS_CURRICULUM_COURSE_IDS);
    expect(curriculumCourseIdsFor("YKS", 7).every((id) => id.startsWith("maarif7-"))).toBe(true);
    expect(curriculumCourseIdsFor("YKS", 9).every((id) => id.startsWith("maarif9-"))).toBe(true);
    expect(curriculumCourseIdsFor("LGS").every((id) => id.startsWith("lgs-"))).toBe(true);
  });

  it("an 11th-grade Genel Deneme counts toward the Maarif TYT courses (the denominator of the topic maps)", () => {
    const ids = generalExamCourseIdsForTitle("11. SINIF Genel Deneme - X");
    expect(ids.sort()).toEqual(MAARIF_TYT_MERGED_COURSES.map((c) => c.id).sort());
    expect(generalExamCourseIdsForTitle("TYT Genel Deneme - X").every((id) => id.startsWith("tyt-"))).toBe(true);
  });

  it("the map now shows an 11th grader's mistakes: a general-exam mistake on a Maarif TYT topic, a branch-exam one on an 11. Sınıf topic", () => {
    const tytMat = findCourseById("maarif-tyt-matematik")!;
    const tytTopic = tytMat.units[0].topics[0].id;
    const ownFizik = findCourseById("maarif11-fizik")!;
    const ownTopic = ownFizik.units[0].topics[0].id;
    const exams = [
      { id: "g1", task_date: "2026-10-01", task_type: "general_exam", course_id: null },
      { id: "g2", task_date: "2026-10-08", task_type: "general_exam", course_id: null },
      { id: "b1", task_date: "2026-10-05", task_type: "branch_exam", course_id: "maarif11-fizik" },
    ];
    const mistakes = [
      { task_id: "g1", course_id: "maarif-tyt-matematik", topic_id: tytTopic },
      { task_id: "g2", course_id: "maarif-tyt-matematik", topic_id: tytTopic },
      { task_id: "b1", course_id: "maarif11-fizik", topic_id: ownTopic },
    ];
    const rows = computeGelisimHaritasi(MAARIF11_CURRICULUM_COURSE_IDS, exams, mistakes);
    const tyt = rows.find((r) => r.courseId === "maarif-tyt-matematik" && r.topicId === tytTopic)!;
    expect(tyt.windowSize).toBe(2); // both general exams
    expect(tyt.count).toBe(2);
    const own = rows.find((r) => r.courseId === "maarif11-fizik" && r.topicId === ownTopic)!;
    expect(own.windowSize).toBe(1); // its own branch exam only
    expect(own.count).toBe(1);
    // with the old standard-TYT list the same data produced no row for these courses at all
    expect(computeGelisimHaritasi(YKS_CURRICULUM_COURSE_IDS, exams, mistakes).some((r) => r.courseId.startsWith("maarif"))).toBe(false);
  });
});

describe("11th grade: the Gelişim Haritası is visible", () => {
  const props = {
    studentId: "s1",
    topicPerformance: [],
    curriculumCourseIds: [] as string[],
    paragrafEntries: [],
    generalExams: [],
    branchExams: [],
    examMistakes: [],
    initialWeekDays: [],
    initialWeekTasks: [],
    initialFixedTasks: [],
    courseResourceData: {},
    today: "2026-10-07",
    initialWeekStats: [],
    karneCycles: [],
    defaultKarneRange: null,
    allTimeTrackedMinutes: 0,
    initialTab: "analiz",
    sessions: [],
  };
  const coachTabs = (grade: MaarifGrade | null) =>
    renderToStaticMarkup(
      <MaarifGradeProvider value={grade}>
        <DetailTabs {...props} />
      </MaarifGradeProvider>,
    );

  it("coach: the 11th grade has the tab; Grafikler and Karneler stay hidden for it", () => {
    const out = coachTabs(11);
    expect(out).toContain("Gelişim Haritası");
    expect(out).toContain("Analiz");
    expect(out).not.toContain(">Grafikler<");
    expect(out).not.toContain(">Karneler<");
  });

  it("coach: nobody else changed (9th / 10th still without it, the 7th and YKS with everything)", () => {
    for (const grade of [9, 10] as const) expect(coachTabs(grade), String(grade)).not.toContain("Gelişim Haritası");
    for (const grade of [7, null] as const) {
      const out = coachTabs(grade);
      expect(out, String(grade)).toContain("Gelişim Haritası");
      expect(out, String(grade)).toContain(">Grafikler<");
    }
  });

  const studentTabs = (grade: MaarifGrade | null) =>
    renderToStaticMarkup(
      <MaarifGradeProvider value={grade}>
        <DenemeAnalizleriLayout>{null}</DenemeAnalizleriLayout>
      </MaarifGradeProvider>,
    );

  it("student: the 11th grade's Deneme Analizleri has Gelişim Haritası (no Karnelerim); 9th / 10th / 7th as before; YKS with all four", () => {
    const eleven = studentTabs(11);
    expect(eleven).toContain("Gelişim Haritası");
    expect(eleven).toContain("Branş Denemesi Analizi");
    expect(eleven).toContain("Genel Deneme Analizi");
    expect(eleven).not.toContain("Karnelerim");
    for (const grade of [7, 9, 10] as const) {
      const out = studentTabs(grade);
      expect(out, String(grade)).not.toContain("Gelişim Haritası");
      expect(out, String(grade)).not.toContain("Karnelerim");
    }
    const yks = studentTabs(null);
    expect(yks).toContain("Gelişim Haritası");
    expect(yks).toContain("Karnelerim");
  });
});
