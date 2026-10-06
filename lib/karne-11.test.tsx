import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/coach/school-exam-actions", () => ({ decideCourseRemoval: vi.fn() }));
vi.mock("@/app/coach/school-grade-actions", () => ({ saveSchoolGradeForStudent: vi.fn(), setSchoolGradeLock: vi.fn() }));
vi.mock("@/app/coach/events/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/student/deneme-analizleri/karne", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { KarneDetailClient as StudentKarneDetail } from "@/app/student/deneme-analizleri/karne/[id]/karne-detail-client";
import { KarneListClient as StudentKarneList } from "@/app/student/deneme-analizleri/karne/karne-client";
import { KarneDetailClient as ParentKarneDetail } from "@/app/parent/karne/[id]/karne-detail-client";
import { KarneListClient as ParentKarneList } from "@/app/parent/karne/karne-client";
import { KarnelerTab, ReportCardReview } from "@/app/coach/students/[id]/_components/karneler-tab";
import { ChartsTab } from "@/app/coach/students/[id]/_components/charts-tab";
import type { DetailTask } from "@/app/coach/students/[id]/types";
import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import { findCourseById } from "./curriculum";
import { curriculumCourseIdsFor, MAARIF11_CURRICULUM_COURSE_IDS } from "./curriculum/cohort";
import { maarif11AssignableCourses, maarif11CourseOptions } from "./maarif-grade";
import {
  computeAylikKarne,
  computeNetSummary,
  computeTytScoreBreakdown,
  type KarneGeneralExam,
  type KarneScoreTask,
  type NetSummary,
} from "./karne";

const RANGE = { start: "2026-10-01", end: "2026-10-28" };

describe("11th grade: Karne topic rows", () => {
  const tytMat = findCourseById("maarif-tyt-matematik")!;
  const tytTopic = tytMat.units[0].topics[0];
  const ownFizik = findCourseById("maarif11-fizik")!;
  const ownTopic = ownFizik.units[0].topics[0];

  const exams = [
    { id: "g1", task_date: "2026-10-03", task_type: "general_exam", course_id: null },
    { id: "g2", task_date: "2026-10-17", task_type: "general_exam", course_id: null },
    { id: "b1", task_date: "2026-10-10", task_type: "branch_exam", course_id: "maarif11-fizik" },
    { id: "b2", task_date: "2026-10-12", task_type: "branch_exam", course_id: "maarif-tyt-matematik" },
  ];
  const mistakes = [
    { task_id: "g1", course_id: "maarif-tyt-matematik", topic_id: tytTopic.id },
    { task_id: "g2", course_id: "maarif-tyt-matematik", topic_id: tytTopic.id },
    { task_id: "b1", course_id: "maarif11-fizik", topic_id: ownTopic.id },
  ];

  it("the generated Karne covers its own courses and the Maarif TYT ones, so an 11th grader's page isn't empty", () => {
    const rows = computeAylikKarne(curriculumCourseIdsFor("YKS", 11), exams, mistakes, RANGE.start, RANGE.end);
    expect(new Set(rows.map((r) => r.courseId))).toEqual(new Set(MAARIF11_CURRICULUM_COURSE_IDS));

    const tyt = rows.find((r) => r.courseId === "maarif-tyt-matematik" && r.topicId === tytTopic.id)!;
    // both Genel Denemeler plus the Matematik branch exam
    expect(tyt.windowSize).toBe(3);
    expect(tyt.count).toBe(2);
    const own = rows.find((r) => r.courseId === "maarif11-fizik" && r.topicId === ownTopic.id)!;
    // its own branch exam only: an 11th-grade Genel Deneme is analysed against Maarif TYT, not these
    expect(own.windowSize).toBe(1);
    expect(own.count).toBe(1);
  });

  it("with the standard YKS list (what it used to get) the same data produced no row for these courses at all", () => {
    const rows = computeAylikKarne(curriculumCourseIdsFor("YKS"), exams, mistakes, RANGE.start, RANGE.end);
    expect(rows.some((r) => r.courseId.startsWith("maarif"))).toBe(false);
  });
});

describe("11th grade: Karne nets and score breakdown", () => {
  const general = (task_date: string, title: string, scores: KarneGeneralExam["subject_scores"]): KarneGeneralExam => ({ task_date, title, subject_scores: scores });

  it("an '11. SINIF Genel Deneme' nets 4:1 like TYT (and never lands in the AYT or LGS half)", () => {
    const exams = [
      general("2026-10-03", "11. SINIF Genel Deneme - Deneme 1", { turkce: { correct: 30, wrong: 4 }, matematik: { correct: 20, wrong: 8 } }),
      general("2026-10-17", "11. SINIF Genel Deneme - Deneme 2", { turkce: { correct: 34, wrong: 0 }, matematik: { correct: 24, wrong: 4 } }),
    ];
    const net = computeNetSummary(exams, RANGE.start, RANGE.end);
    // averages: correct 54, wrong 8 -> 54 - 8/4
    expect(net.tyt).toBe(52);
    expect(net.ayt).toBeNull();
    expect(net.lgs).toBeNull();
    expect(net.m7).toBeNull();
  });

  it("the D/Y/B breakdown counts Maarif TYT and 11. Sınıf practice plus the Genel Deneme, in the four TYT sections", () => {
    const tasks: KarneScoreTask[] = [
      { task_date: "2026-10-05", course_id: "maarif-tyt-matematik", correct_count: 10, wrong_count: 2, empty_count: 1 },
      { task_date: "2026-10-06", course_id: "maarif-tyt-geometri", correct_count: 5, wrong_count: 1, empty_count: 0 },
      { task_date: "2026-10-07", course_id: "maarif11-fizik", correct_count: 8, wrong_count: 2, empty_count: 0 },
      { task_date: "2026-10-08", course_id: "maarif11-tarih", correct_count: 6, wrong_count: 0, empty_count: 2 },
      { task_date: "2026-10-09", course_id: "maarif-tyt-turk-dili-ve-edebiyati", correct_count: 7, wrong_count: 3, empty_count: 0 },
      { task_date: "2026-11-09", course_id: "maarif-tyt-matematik", correct_count: 99, wrong_count: 99, empty_count: 99 },
    ];
    const exams = [general("2026-10-03", "11. SINIF Genel Deneme - X", { matematik: { correct: 20, wrong: 8, empty: 12 }, fen: { correct: 10, wrong: 5, empty: 5 } })];
    const { total, bySubject } = computeTytScoreBreakdown(tasks, exams, RANGE.start, RANGE.end);
    const row = (key: string) => bySubject.find((r) => r.key === key)!;
    expect(row("matematik")).toMatchObject({ correct: 10 + 5 + 20, wrong: 2 + 1 + 8, empty: 1 + 0 + 12 });
    expect(row("fen")).toMatchObject({ correct: 8 + 10, wrong: 2 + 5, empty: 0 + 5 });
    expect(row("sosyal")).toMatchObject({ correct: 6, wrong: 0, empty: 2 });
    expect(row("turkce")).toMatchObject({ correct: 7, wrong: 3, empty: 0 });
    expect(total.correct).toBe(35 + 18 + 6 + 7);
  });
});

describe("11th grade: the Karne screens", () => {
  const stats: NetSummary = {
    tyt: { current: 52, previous: 48.5 },
    ayt: { current: null, previous: null },
    scoreBreakdown: {
      total: { correct: 60, wrong: 10, empty: 5 },
      bySubject: [{ key: "matematik", label: "Matematik", correct: 60, wrong: 10, empty: 5 }],
    },
    examLabel: "11. Sınıf Genel Deneme",
    maarifGrade: 11,
    totalDurationMinutes: 600,
  };
  const topicRows = computeAylikKarne(
    MAARIF11_CURRICULUM_COURSE_IDS,
    [{ id: "g1", task_date: "2026-10-03", task_type: "general_exam", course_id: null }],
    [],
    RANGE.start,
    RANGE.end,
  );
  const detailProps = {
    cycleNumber: 1,
    rangeStart: RANGE.start,
    rangeEnd: RANGE.end,
    approvedAt: "2026-10-30T10:00:00Z",
    coachNotes: null,
    stats,
    topicRows,
  };

  function expectEleventhGradeDetail(out: string) {
    expect(out).toContain("11. Sınıf Genel Deneme Ortalama Net");
    expect(out).toContain(">52<");
    expect(out).not.toContain("AYT Genel Deneme");
    expect(out).not.toContain("TYT Genel Deneme Ortalama Net");
    // Maarif TYT + 11. Sınıf course tabs, with a populated Maarif TYT topic grid (the Genel Deneme counted for it)
    expect(out).toContain("Maarif TYT");
    expect(out).toContain("11. Sınıf");
    expect(out).toMatch(/0\/1(<\/p>| bu dönemki deneme)/);
    expect(out).not.toContain("Bu dönemde bu ders için deneme kaydı yok.");
  }

  it("student: the detail shows the 11. Sınıf net and the Maarif TYT / 11. Sınıf course tabs", () => {
    expectEleventhGradeDetail(renderToStaticMarkup(<StudentKarneDetail {...detailProps} />));
  });

  it("parent: the same detail, same labels", () => {
    expectEleventhGradeDetail(renderToStaticMarkup(<ParentKarneDetail {...detailProps} />));
  });

  it("coach: the review card shows the same", () => {
    const cycle = {
      id: "c1",
      cycle_number: 1,
      range_start: RANGE.start,
      range_end: RANGE.end,
      status: "draft" as const,
      coach_notes: null,
      stats,
      topic_mistakes: topicRows,
      generated_at: "2026-10-29T10:00:00Z",
      approved_at: null,
    };
    expectEleventhGradeDetail(
      renderToStaticMarkup(
        <MaarifGradeProvider value={11}>
          <ReportCardReview cycle={cycle} onApproved={() => {}} onDeleted={() => {}} />
        </MaarifGradeProvider>,
      ),
    );
  });

  it("the list screens chart the 11th grade's net under one '11. Sınıf Net Gelişimi' heading, without an AYT chart", () => {
    const item = { id: "c1", cycle_number: 1, range_start: RANGE.start, range_end: RANGE.end, approved_at: "2026-10-30T10:00:00Z", stats };
    for (const out of [
      renderToStaticMarkup(<StudentKarneList cycles={[item]} />),
      renderToStaticMarkup(<ParentKarneList cycles={[item]} />),
      renderToStaticMarkup(
        <KarnelerTab studentId="s1" cycles={[{ ...item, status: "approved", coach_notes: null, topic_mistakes: [], generated_at: item.approved_at }]} defaultRange={null} allTimeTrackedMinutes={0} />,
      ),
    ]) {
      expect(out).toContain("11. Sınıf Net Gelişimi");
      expect(out).not.toContain("AYT Net Gelişimi");
    }
  });

  it("a plain YKS card is unchanged (TYT + AYT halves)", () => {
    const yks: NetSummary = { tyt: { current: 40, previous: null }, ayt: { current: 30, previous: null } };
    const out = renderToStaticMarkup(<StudentKarneDetail {...detailProps} stats={yks} topicRows={[]} />);
    expect(out).toContain("TYT Genel Deneme Ortalama Net");
    expect(out).toContain("AYT Genel Deneme Ortalama Net");
    expect(out).not.toContain("11. Sınıf Genel Deneme");
  });
});

describe("11th grade: Grafikler", () => {
  it("renders the Genel Deneme history and chart for an 11th grader's exam (TYT-structured, 4:1 net)", () => {
    const exam = {
      id: "e1",
      task_date: "2026-10-03",
      task_type: "general_exam",
      title: "11. SINIF Genel Deneme - Deneme 1",
      course_id: null,
      subject_scores: { turkce: { correct: 30, wrong: 4, empty: 6 }, matematik: { correct: 20, wrong: 8, empty: 12 } },
    } as unknown as DetailTask;
    const out = renderToStaticMarkup(
      <MaarifGradeProvider value={11}>
        <ChartsTab
          studentId="s1"
          paragrafEntries={[]}
          generalExams={[exam]}
          branchExams={[]}
          examMistakes={[]}
          weekDays={[]}
          courseResourceData={{}}
          chartRange={{ type: "custom", startDate: "2026-10-01", endDate: "2026-10-31" }}
        />
      </MaarifGradeProvider>,
    );
    expect(out).toContain("11. SINIF Genel Deneme - Deneme 1");
    // 50 correct, 12 wrong -> 50 - 12/4
    expect(out).toContain("47.00");
    // no TYT/AYT toggle for a Maarif student
    expect(out).not.toContain(">AYT<");
  });

  it("its Branş picker lists the 11. Sınıf courses, then the Maarif TYT ones (not the standard TYT list)", () => {
    const options = maarif11CourseOptions();
    expect(options.filter((o) => o.group === "11. Sınıf").map((o) => o.id)).toEqual(MAARIF11_CURRICULUM_COURSE_IDS.filter((id) => id.startsWith("maarif11-")));
    expect(options.filter((o) => o.group === "Maarif TYT")).toHaveLength(10);
    expect(options.some((o) => o.id.startsWith("tyt-"))).toBe(false);
    expect(maarif11AssignableCourses()[0].id.startsWith("maarif11-")).toBe(true);
  });
});
