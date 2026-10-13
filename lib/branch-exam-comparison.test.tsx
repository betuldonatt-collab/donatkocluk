import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/student/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { BransAnalysisClient } from "@/app/student/deneme-analizleri/brans/brans-analysis-client";
import { BranchExamComparisonView } from "@/components/exam-comparison-view";
import type { ExamDetailExam } from "@/components/exam-detail-view";
import { findCourseById } from "./curriculum";
import { flattenSelectionRows } from "./curriculum/rows";
import { comparableBranchExams, rowRecurrence } from "./exam-detail";
import { computeNet } from "./scoring";

// ---- the pure helpers ----------------------------------------------------------------------------------------------------------------

type T = { id: string; task_type: string; course_id: string | null; task_date: string };
const t = (id: string, course: string | null, date: string, type = "branch_exam"): T => ({ id, task_type: type, course_id: course, task_date: date });
const inOctober = (d: string) => d >= "2026-10-01" && d <= "2026-10-31";

describe("comparableBranchExams", () => {
  const all = [
    t("a", "tyt-fen-macro", "2026-10-03"),
    t("b", "tyt-fen-macro", "2026-10-17"),
    t("c", "tyt-fen-macro", "2026-09-20"), // before the range
    t("d", "tyt-fizik", "2026-10-10"), // another course (a single subject, not the combined one)
    t("e", "tyt-fen-macro", "2026-10-10", "general_exam"), // not a branch exam
    t("f", "tyt-fen-macro", "2026-10-10"),
  ];

  it("the same course only, inside the range, newest first", () => {
    const focus = all[0];
    expect(comparableBranchExams(all, focus, inOctober).map((e) => e.id)).toEqual(["b", "f", "a"]);
  });

  it("the clicked exam is always included, even when the range would not contain it", () => {
    const old = all[2];
    expect(comparableBranchExams(all, old, inOctober).map((e) => e.id)).toEqual(["b", "f", "a", "c"]);
  });

  it("a single-subject course is compared only with itself", () => {
    expect(comparableBranchExams(all, all[3], inOctober).map((e) => e.id)).toEqual(["d"]);
  });

  it("two exams on one day keep a stable order (by id)", () => {
    const same = [t("z", "x", "2026-10-05"), t("m", "x", "2026-10-05")];
    expect(comparableBranchExams(same, same[0], inOctober).map((e) => e.id)).toEqual(["m", "z"]);
  });
});

describe("rowRecurrence", () => {
  const marked = new Map<string, Set<string>>([
    ["e1", new Set(["t1", "t2"])],
    ["e2", new Set(["t1"])],
    ["e3", new Set<string>()],
  ]);
  it("counts the shown exams in which any of a row's topics was marked", () => {
    expect(rowRecurrence({ memberTopicIds: ["t1"] }, ["e1", "e2", "e3"], marked)).toBe(2);
    expect(rowRecurrence({ memberTopicIds: ["t2"] }, ["e1", "e2", "e3"], marked)).toBe(1);
    // a rolled-up row: once per exam, however many of its topics were marked
    expect(rowRecurrence({ memberTopicIds: ["t1", "t2"] }, ["e1", "e2", "e3"], marked)).toBe(2);
    expect(rowRecurrence({ memberTopicIds: ["nope"] }, ["e1", "e2", "e3"], marked)).toBe(0);
    expect(rowRecurrence({ memberTopicIds: ["t1"] }, [], marked)).toBe(0);
  });
});

// ---- the table ---------------------------------------------------------------------------------------------------------------------------

describe("BranchExamComparisonView", () => {
  const course = findCourseById("tyt-fizik")!;
  const rows = flattenSelectionRows(course);
  const topicA = rows[0].memberTopicIds[0];
  const topicB = rows[1].memberTopicIds[0];
  const topicC = rows[2].memberTopicIds[0];

  const exam = (id: string, date: string, c: number, w: number, minutes: number, pending = false): ExamDetailExam => ({
    id,
    title: `TYT Fizik Branş Denemesi - Yayın ${id.toUpperCase()}`,
    task_date: date,
    task_type: "branch_exam",
    course_id: "tyt-fizik",
    total_count: c + w,
    correct_count: c,
    wrong_count: w,
    empty_count: 0,
    duration_minutes: minutes,
    subject_scores: null,
    analysis_pending: pending,
  });
  // newest first
  const exams = [exam("c", "2026-10-17", 12, 2, 30), exam("b", "2026-10-10", 9, 5, 28), exam("a", "2026-10-03", 6, 8, 35, true)];
  const marked = new Map<string, Set<string>>([
    ["c", new Set([topicA])],
    ["b", new Set([topicA, topicB])],
    ["a", new Set([topicA])],
  ]);
  const html = renderToStaticMarkup(
    <BranchExamComparisonView course={course} exams={exams} focusExamId="b" markedByExam={marked} netOf={computeNet} />,
  );

  it("one column per exam, newest on the left, each with its own D / Y / B, Net and Süre", () => {
    const heads = [...html.matchAll(/>Yayın ([ABC])<\/span>/g)].map((m) => m[1]);
    expect(heads).toEqual(["C", "B", "A"]);
    expect(html).toContain(`Net ${computeNet(12, 2).toFixed(2)}`);
    expect(html).toContain(`Net ${computeNet(6, 8).toFixed(2)}`);
    expect(html).toContain("Süre 30 dk");
    expect(html).toContain("Süre 35 dk");
    expect(html).toContain("D:12 Y:2 B:0");
  });

  it("the clicked exam's column is highlighted, and an exam without topic analysis says so", () => {
    expect(html.match(/data-focused/g)).toHaveLength(1);
    expect(html).toContain("Analiz Bekliyor");
  });

  it("topics are rows: a plain X where a topic was marked, and a Tekrar column counting the exams it was marked in", () => {
    const counts = [...html.matchAll(/data-count="(\d+)"/g)].map((m) => Number(m[1]));
    expect(counts[0]).toBe(3); // topicA: all three exams
    expect(counts[1]).toBe(1); // topicB: only the middle one
    expect(counts[2]).toBe(0);
    expect(html).toContain("3/3");
    expect(html).toContain("1/3");
    // X marks: 3 for topicA, 1 for topicB
    expect(html.match(/aria-label="İşaretli"/g)).toHaveLength(4);
    // a topic marked in 2+ exams is emphasised
    expect(html).toMatch(/class="[^"]*text-rose-700[^"]*" data-count="3"/);
    expect(topicC).toBeTruthy();
  });

  it("keeps its headings visible: a height-bounded frame with a sticky header row and sticky Ünite / Konu / Tekrar columns", () => {
    expect(html).toContain("max-h-[60dvh]");
    expect(html).toContain("overflow-auto");
    expect(html).toMatch(/<th[^>]*sticky top-0[^>]*>Konu<\/th>/);
    expect(html).toMatch(/<th[^>]*sticky top-0[^>]*>Tekrar<\/th>/);
    // each exam's header sticks too
    expect((html.match(/sticky top-0 z-30/g) ?? []).length).toBe(exams.length);
  });

  it("many exams: every one is a column (no truncation) inside the same scrolling frame", () => {
    const many = Array.from({ length: 25 }, (_, i) => exam(`x${i}`, `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`, 10, 2, 20));
    const out = renderToStaticMarkup(
      <BranchExamComparisonView course={course} exams={many} focusExamId="x3" markedByExam={new Map()} netOf={computeNet} />,
    );
    expect(out.match(/data-focused/g)).toHaveLength(1);
    expect((out.match(/>Yayın X\d+<\/span>/g) ?? []).length).toBe(25);
    expect(out).toContain("25 deneme");
  });

  it("an empty / unknown course is a plain message, not a crash", () => {
    expect(renderToStaticMarkup(<BranchExamComparisonView course={null} exams={exams} focusExamId="b" markedByExam={marked} netOf={computeNet} />)).toContain(
      "konu tablosu bulunamadı",
    );
    expect(renderToStaticMarkup(<BranchExamComparisonView course={course} exams={[]} focusExamId="b" markedByExam={marked} netOf={computeNet} />)).toContain(
      "Karşılaştırılacak deneme yok",
    );
  });
});

// ---- wiring ------------------------------------------------------------------------------------------------------------------------------

describe("wiring", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("the Grafikler popup compares branch exams of the same course inside the chart's date range", () => {
    const dialog = read("../app/coach/students/[id]/_components/exam-detail-dialog.tsx");
    expect(dialog).toContain("comparableBranchExams(allBranchExams, exam, isInRange)");
    expect(dialog).toContain("<BranchExamComparisonView");
    const charts = read("../app/coach/students/[id]/_components/charts-tab.tsx");
    expect(charts).toContain("allBranchExams={branchExams}");
    expect(charts).toContain("isInRange={(date) => isDateInChartRange(date, chartRange)}");
  });
});

// ---- the student's Branş page: a date range ---------------------------------------------------------------------------------------------

describe("student Branş analysis: date range", () => {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const task = (id: string, date: string, courseId: string) =>
    ({
      id,
      student_id: "s",
      task_date: date,
      task_type: "branch_exam",
      title: `Branş - Yayın ${id}`,
      course_id: courseId,
      correct_count: 10,
      wrong_count: 2,
      empty_count: 0,
      total_count: 12,
      duration_minutes: 20,
      status: "done",
    }) as never;

  const render = (exams: unknown[], hasMore = false) =>
    renderToStaticMarkup(<BransAnalysisClient initialExams={exams as never} initialMistakes={[]} initialHasMore={hasMore} examType="YKS" />);

  it("opens on Son 30 Gün with the range picker, a count, and how many exams are outside the range", () => {
    const html = render([task("new", day(-3), "tyt-fen-macro"), task("old", day(-90), "tyt-fen-macro")]);
    expect(html).toContain("Son 30 Gün");
    expect(html).toContain("1 branş denemesi");
    expect(html).toContain("aralığın dışında 1 deneme daha var");
  });

  it("only exams inside the range are columns of the tables", () => {
    // (the first course tab of the TYT list is TYT Sosyal)
    const html = render([task("NEW", day(-3), "tyt-sosyal-macro"), task("OLD", day(-90), "tyt-sosyal-macro")]);
    expect(html).toContain("Yayın NEW");
    expect(html).not.toContain("Yayın OLD");
  });

  it("with no exams at all there is no 'outside' note", () => {
    const html = render([]);
    expect(html).toContain("0 branş denemesi");
    expect(html).not.toContain("aralığın dışında");
  });
});
