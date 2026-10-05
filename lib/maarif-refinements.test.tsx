import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The components below import server actions / the router; the rendering tests never call them.
vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/student", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("@/components/ui/platform-tour", () => ({ TourTrigger: () => null }));
vi.mock("@/components/ui/yks-countdown", () => ({ YksCountdown: () => null }));

import { routineOptionsFor } from "@/app/coach/students/[id]/_components/kanban/routine-options";
import { ChartsTab } from "@/app/coach/students/[id]/_components/charts-tab";
import type { LgsDailyRoutine } from "@/app/coach/students/[id]/types";
import { StudentSidebar } from "@/app/student/_components/sidebar";
import { KarneDetailClient as StudentKarneDetail } from "@/app/student/deneme-analizleri/karne/[id]/karne-detail-client";
import { KarneListClient as StudentKarneList } from "@/app/student/deneme-analizleri/karne/karne-client";
import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import {
  curriculumCourseIdsFor,
  generalExamCourseIdsForTitle,
  LGS_CURRICULUM_COURSE_IDS,
  MAARIF10_CURRICULUM_COURSE_IDS,
  MAARIF7_CURRICULUM_COURSE_IDS,
  MAARIF9_CURRICULUM_COURSE_IDS,
  YKS_CURRICULUM_COURSE_IDS,
} from "./curriculum/cohort";
import { MAARIF_GRADES, type MaarifGrade } from "./maarif-grade";
import type { NetSummary } from "./karne";

const range = { type: "custom" as const, startDate: "2026-09-01", endDate: "2026-10-31" };

// ----------------------------------------------------------------------------------------------------------------
describe("1. the student's own Karne for a 7th grader", () => {
  const stats: NetSummary = {
    tyt: { current: null, previous: null },
    ayt: { current: null, previous: null },
    lgs: { current: 61.5, previous: 58 },
    lgsScoreBreakdown: { total: { correct: 70, wrong: 12, empty: 8 }, bySubject: [{ key: "m7_turkce", label: "Türkçe", correct: 15, wrong: 3, empty: 2 }] },
    examLabel: "7. Sınıf Genel Deneme",
    maarifGrade: 7,
  };
  const lgsStats: NetSummary = { ...stats, examLabel: undefined, maarifGrade: undefined };
  const detail = (s: NetSummary) =>
    renderToStaticMarkup(
      <StudentKarneDetail cycleNumber={1} rangeStart="2026-09-01" rangeEnd="2026-09-28" approvedAt={null} coachNotes={null} stats={s} topicRows={[]} />,
    );

  it("titles the net card '7. Sınıf Genel Deneme Ortalama Net', not LGS", () => {
    const html = detail(stats);
    expect(html).toContain("7. Sınıf Genel Deneme Ortalama Net");
    expect(html).not.toContain("LGS");
  });

  it("lists the 7th grade's own courses under SÖZEL / SAYISAL in the topic grid", () => {
    const html = detail(stats);
    expect(html).toContain("SÖZEL");
    expect(html).toContain("SAYISAL");
    expect(html).toContain("Din Kültürü ve Ahlak Bilgisi");
    expect(html).not.toContain("İnkılap");
  });

  it("an LGS card still says LGS", () => {
    const html = detail(lgsStats);
    expect(html).toContain("LGS Genel Deneme Ortalama Net");
    expect(html).toContain("İnkılap");
  });

  it("the student's Karne list labels the trend '7. Sınıf Net Gelişimi' for a 7th grader and 'LGS Net Gelişimi' otherwise", () => {
    const item = (s: NetSummary) => ({ id: "c1", cycle_number: 1, range_start: "2026-09-01", range_end: "2026-09-28", approved_at: "2026-09-29T10:00:00Z", stats: s });
    expect(renderToStaticMarkup(<StudentKarneList cycles={[item(stats)]} />)).toContain("7. Sınıf Net Gelişimi");
    expect(renderToStaticMarkup(<StudentKarneList cycles={[item(lgsStats)]} />)).toContain("LGS Net Gelişimi");
  });
});

// ----------------------------------------------------------------------------------------------------------------
describe("2. the 7th grader's Paragraf / Kitap Okuma", () => {
  const routine = (over: Partial<LgsDailyRoutine>): LgsDailyRoutine =>
    ({
      id: "r",
      entry_date: "2026-10-01",
      paragraf_correct: 0,
      paragraf_wrong: 0,
      paragraf_empty: 0,
      paragraf_duration_minutes: null,
      book_title: null,
      book_author: null,
      book_pages_read: null,
      ...over,
    }) as LgsDailyRoutine;
  const charts = (grade: MaarifGrade | null, routines: LgsDailyRoutine[] = []) =>
    renderToStaticMarkup(
      <MaarifGradeProvider value={grade}>
        <ChartsTab paragrafEntries={[]} generalExams={[]} branchExams={[]} lgsRoutines={routines} chartRange={range} />
      </MaarifGradeProvider>,
    );

  it("charts Paragraf and Kitap Okuma for a 7th grader, with no Problem", () => {
    const html = charts(7);
    expect(html).toContain("Paragraf Gelişimi");
    expect(html).toContain("Kitap Okuma Gelişimi");
    expect(html).not.toContain("Problem Gelişimi");
  });

  it("is drawn from the daily entries: the Kitap Okuma pages and the Paragraf net (3 yanlış 1 doğruyu götürür) show up", () => {
    // 20 doğru, 6 yanlış -> net 18 (3:1), where the YKS 4:1 rule would give 18.5
    const html = charts(7, [routine({ paragraf_correct: 20, paragraf_wrong: 6, paragraf_duration_minutes: 25, book_pages_read: 42 })]);
    expect(html).toContain("42");
    expect(html).toContain("18");
    expect(html).not.toContain("18.5");
  });

  it("the other Maarif grades keep Problem (YKS structure), and so does a plain YKS student", () => {
    expect(charts(9)).toContain("Problem Gelişimi");
    expect(charts(null)).toContain("Problem Gelişimi");
    expect(charts(9)).not.toContain("Kitap Okuma Gelişimi");
  });

  it("the coach's Rutin Türü for a 7th grader: Paragraf, Kitap Okuma, Diğer (no Problem)", () => {
    expect(routineOptionsFor("YKS", 7).map((o) => o.value)).toEqual(["paragraf", "kitap-okuma", "diger"]);
    expect(routineOptionsFor("YKS", 9).map((o) => o.value)).toEqual(["paragraf", "problem", "kitap-okuma", "diger"]);
    expect(routineOptionsFor("YKS").map((o) => o.value)).toEqual(["paragraf", "problem", "kitap-okuma", "diger"]);
    expect(routineOptionsFor("LGS").map((o) => o.value)).toEqual(["paragraf", "kitap-okuma", "yeni-nesil-mat-dozu", "diger"]);
  });

  it("the student's sidebar calls the tracker 'Paragraf / Kitap Okuma' for a 7th grader and LGS, 'Paragraf/Problem Takibi' for others", () => {
    const side = (grade: MaarifGrade | null, examType: "YKS" | "LGS" = "YKS") =>
      renderToStaticMarkup(
        <MaarifGradeProvider value={grade}>
          <StudentSidebar examType={examType} isMaarif9={grade !== null} />
        </MaarifGradeProvider>,
      );
    expect(side(7)).toContain("Paragraf / Kitap Okuma");
    expect(side(null, "LGS")).toContain("Paragraf / Kitap Okuma");
    expect(side(9)).toContain("Paragraf/Problem Takibi");
    expect(side(null)).toContain("Paragraf/Problem Takibi");
  });
});

// ----------------------------------------------------------------------------------------------------------------
describe("3. the Konu Performans Haritası of 9th and 10th graders", () => {
  it("covers each grade's own courses, exactly the ones its Kaynak Takibi chips list", () => {
    expect(curriculumCourseIdsFor("YKS", 9)).toBe(MAARIF9_CURRICULUM_COURSE_IDS);
    expect(curriculumCourseIdsFor("YKS", 10)).toBe(MAARIF10_CURRICULUM_COURSE_IDS);
    expect(MAARIF9_CURRICULUM_COURSE_IDS).toEqual(MAARIF_GRADES[9].courses.map((c) => c.id));
    expect(MAARIF10_CURRICULUM_COURSE_IDS).toEqual(MAARIF_GRADES[10].courses.map((c) => c.id));
    expect(MAARIF9_CURRICULUM_COURSE_IDS.length).toBeGreaterThan(0);
    expect(MAARIF10_CURRICULUM_COURSE_IDS.length).toBeGreaterThan(0);
    // no YKS course leaks in, so every chip has rows
    for (const id of [...MAARIF9_CURRICULUM_COURSE_IDS, ...MAARIF10_CURRICULUM_COURSE_IDS]) expect(YKS_CURRICULUM_COURSE_IDS).not.toContain(id);
  });

  it("every course of those grades yields topic rows (so no chip says 'konu verisi yok')", async () => {
    const { findCourseById } = await import("./curriculum");
    for (const id of [...MAARIF9_CURRICULUM_COURSE_IDS, ...MAARIF10_CURRICULUM_COURSE_IDS]) {
      const course = findCourseById(id);
      expect(course, id).toBeTruthy();
      expect(course!.units.flatMap((u) => u.topics).length, id).toBeGreaterThan(0);
    }
  });

  it("keeps the 7th grade, LGS, YKS and the 11th grade as before", () => {
    expect(curriculumCourseIdsFor("YKS", 7)).toBe(MAARIF7_CURRICULUM_COURSE_IDS);
    expect(curriculumCourseIdsFor("LGS")).toBe(LGS_CURRICULUM_COURSE_IDS);
    expect(curriculumCourseIdsFor("YKS")).toBe(YKS_CURRICULUM_COURSE_IDS);
    expect(curriculumCourseIdsFor("YKS", 11)).toBe(YKS_CURRICULUM_COURSE_IDS);
  });

  it("a general exam counts toward the courses of its own cohort (the topic map's denominator)", () => {
    expect(generalExamCourseIdsForTitle("9. SINIF Genel Deneme - X").every((id) => id.startsWith("maarif9-"))).toBe(true);
    expect(generalExamCourseIdsForTitle("10. SINIF Genel Deneme").every((id) => id.startsWith("maarif10-"))).toBe(true);
    expect(generalExamCourseIdsForTitle("7. SINIF Genel Deneme").every((id) => id.startsWith("maarif7-"))).toBe(true);
    expect(generalExamCourseIdsForTitle("LGS Genel Deneme")).toEqual(LGS_CURRICULUM_COURSE_IDS);
    expect(generalExamCourseIdsForTitle("TYT Genel Deneme").every((id) => id.startsWith("tyt-"))).toBe(true);
    expect(generalExamCourseIdsForTitle("9. SINIF Genel Deneme").length).toBeGreaterThan(0);
  });
});
