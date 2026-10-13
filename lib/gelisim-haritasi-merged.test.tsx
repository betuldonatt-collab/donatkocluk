import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GelisimHaritasi } from "@/app/student/deneme-analizleri/_components/gelisim-haritasi";
import { TrialSourceSwitch } from "@/components/trial-source-switch";
import { findCourseById, macroSourceCourseIds, macroTopicCourseId } from "./curriculum";
import { YKS_CURRICULUM_COURSE_IDS } from "./curriculum/cohort";
import { TopicPerformanceMap } from "@/app/coach/students/[id]/_components/topic-performance-map";
import type { DetailTask } from "@/app/coach/students/[id]/types";
import { computeAylikKarne } from "./karne";
import { computeGelisimHaritasi, type TrialExam } from "./gelisim-haritasi";

// One merged map per atomic subject: Genel Denemeler of the track + combined ("macro") Branş exams it is part of + its own single
// Branş exams, with pending-analysis exams left out and AYT exams feeding AYT courses.

const topic = (courseId: string, n = 0) => findCourseById(courseId)!.units[0].topics[n].id;
const FIZIK = "tyt-fizik";
const KIMYA = "tyt-kimya";
const score = (c: number, w: number, e: number) => ({ correct: c, wrong: w, empty: e });
const tytScores = { turkce: score(30, 5, 5), sosyal: score(15, 3, 2), matematik: score(25, 10, 5), fen: score(10, 6, 4) };

const exam = (over: Partial<TrialExam> & { id: string }): TrialExam => ({
  task_date: "2026-10-01",
  task_type: "branch_exam",
  course_id: null,
  title: "x",
  subject_scores: null,
  analysis_pending: false,
  ...over,
});

const exams: TrialExam[] = [
  exam({ id: "g1", task_type: "general_exam", title: "TYT Genel Deneme - A", task_date: "2026-10-20", subject_scores: tytScores }),
  exam({ id: "m1", course_id: "tyt-fen-macro", title: "TYT Fen Branş Denemesi - B", task_date: "2026-10-15" }),
  exam({ id: "s1", course_id: FIZIK, title: "TYT Fizik Branş Denemesi - C", task_date: "2026-10-10" }),
  exam({ id: "k1", course_id: KIMYA, title: "TYT Kimya Branş Denemesi - D", task_date: "2026-10-12" }),
  exam({ id: "p1", course_id: "tyt-fen-macro", title: "TYT Fen Branş Denemesi - E", task_date: "2026-10-25", analysis_pending: true }),
  exam({ id: "a1", task_type: "general_exam", title: "AYT Genel Deneme - F", task_date: "2026-10-18", subject_scores: { ayt_fizik: score(10, 2, 1), ayt_matematik: score(20, 5, 5) } }),
];
const aytFizikTopic = topic("ayt-fizik");
const mistakes = [
  { task_id: "g1", course_id: FIZIK, topic_id: topic(FIZIK), status: "wrong" as const },
  // the combined exam stores its marks under the MACRO course id, with the atomic course's own topic ids
  { task_id: "m1", course_id: "tyt-fen-macro", topic_id: topic(FIZIK), status: "blank" as const },
  { task_id: "m1", course_id: "tyt-fen-macro", topic_id: topic(KIMYA), status: "wrong" as const },
  { task_id: "s1", course_id: FIZIK, topic_id: topic(FIZIK), status: "wrong" as const },
  { task_id: "p1", course_id: "tyt-fen-macro", topic_id: topic(FIZIK), status: "wrong" as const },
  { task_id: "a1", course_id: "ayt-fizik", topic_id: aytFizikTopic, status: "wrong" as const },
];
const ids = [FIZIK, KIMYA, "ayt-fizik", "tyt-fen-macro"];
const rowOf = (rows: ReturnType<typeof computeGelisimHaritasi>, courseId: string, topicId: string) =>
  rows.find((r) => r.courseId === courseId && r.topicId === topicId)!;

describe("curriculum: combined exams know their atomic subjects", () => {
  it("lists the courses a macro is made of and which of them owns a topic", () => {
    expect(macroSourceCourseIds("tyt-fen-macro")).toEqual(["tyt-fizik", "tyt-kimya", "tyt-biyoloji"]);
    expect(macroSourceCourseIds("tyt-fizik")).toEqual([]);
    expect(macroTopicCourseId("tyt-fen-macro", topic(KIMYA))).toBe(KIMYA);
    expect(macroTopicCourseId("tyt-fen-macro", topic("tyt-matematik"))).toBeNull();
    expect(macroTopicCourseId("tyt-fizik", topic(FIZIK))).toBeNull();
  });
});

describe("computeGelisimHaritasi: one merged map per subject", () => {
  const rows = computeGelisimHaritasi(ids, exams, mistakes);

  it("a subject's trials are its Genel Denemeler + the combined exams it is part of + its own single exams", () => {
    const fizik = rowOf(rows, FIZIK, topic(FIZIK));
    expect(fizik.windowSize).toBe(3); // g1, m1, s1 -- not k1 (Kimya), a1 (AYT) or p1 (pending)
    expect(fizik.count).toBe(3);
    expect(fizik.wrongCount).toBe(2); // g1, s1
    expect(fizik.blankCount).toBe(1); // m1: the macro exam's mark lands on Fizik
    expect(fizik.breakdown).toEqual(expect.arrayContaining([
      { label: "Genel Deneme", count: 1 },
      { label: "TYT Fen Branş", count: 1 },
      { label: "TYT Fizik Branş", count: 1 },
    ]));
    expect(fizik.examTitles.sort()).toEqual(["TYT Fen Branş Denemesi - B", "TYT Fizik Branş Denemesi - C", "TYT Genel Deneme - A"]);
  });

  it("another subject of the same combined exam gets it too, with its own marks", () => {
    const kimya = rowOf(rows, KIMYA, topic(KIMYA));
    expect(kimya.windowSize).toBe(3); // g1, m1, k1
    expect(kimya.count).toBe(1); // only the macro exam marked it
    expect(kimya.wrongCount).toBe(1);
    expect(rowOf(rows, FIZIK, topic(FIZIK, 1)).count).toBe(0);
  });

  it("an exam whose topic analysis is still pending is left out of the window completely", () => {
    const fizik = rowOf(rows, FIZIK, topic(FIZIK));
    expect(fizik.examTitles).not.toContain("TYT Fen Branş Denemesi - E");
    expect(fizik.windowSize).toBe(3);
    // and it counts again once the analysis is in
    const done = computeGelisimHaritasi(ids, exams.map((e) => (e.id === "p1" ? { ...e, analysis_pending: false } : e)), mistakes);
    expect(rowOf(done, FIZIK, topic(FIZIK)).windowSize).toBe(4);
  });

  it("the combined courses themselves produce no rows -- the atomic subjects carry everything", () => {
    expect(rows.some((r) => r.courseId === "tyt-fen-macro")).toBe(false);
  });

  it("AYT: an AYT Genel Deneme feeds the AYT course, and no longer the TYT ones", () => {
    const ayt = rowOf(rows, "ayt-fizik", aytFizikTopic);
    expect(ayt.windowSize).toBe(1);
    expect(ayt.count).toBe(1);
    expect(ayt.breakdown).toEqual([{ label: "Genel Deneme", count: 1 }]);
    // the TYT Fizik window above did not include a1 (windowSize 3), and a TYT Genel does not feed ayt-fizik
    expect(rowOf(rows, "ayt-fizik", aytFizikTopic).examTitles).toEqual(["AYT Genel Deneme - F"]);
  });

  it("a Genel Deneme counts only for the subjects that have a score in it", () => {
    const onlyTurkce = [exam({ id: "g2", task_type: "general_exam", title: "TYT Genel Deneme - Z", subject_scores: { turkce: score(30, 5, 5) } })];
    const r = computeGelisimHaritasi([FIZIK, "tyt-turkce"], onlyTurkce, []);
    expect(r.find((x) => x.courseId === FIZIK)!.windowSize).toBe(0);
    expect(r.find((x) => x.courseId === "tyt-turkce")!.windowSize).toBe(1);
  });

  it("the source switch narrows the same map: only Genel, or only Branş (single and combined)", () => {
    const pick = (source: "all" | "general" | "branch") => rowOf(computeGelisimHaritasi(ids, exams, mistakes, { source }), FIZIK, topic(FIZIK));
    expect(pick("all").windowSize).toBe(3);
    expect(pick("general").windowSize).toBe(1);
    expect(pick("general").count).toBe(1);
    expect(pick("branch").windowSize).toBe(2);
    expect(pick("branch").count).toBe(2);
  });

  it("has NO cap on how many exams it aggregates: every exam handed over counts", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      exam({ id: `s${i}`, course_id: FIZIK, title: `T${i}`, task_date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}` }),
    );
    const marks = many.map((e) => ({ task_id: e.id, course_id: FIZIK, topic_id: topic(FIZIK) }));
    const r = rowOf(computeGelisimHaritasi([FIZIK], many, marks), FIZIK, topic(FIZIK));
    expect(r.windowSize).toBe(30);
    expect(r.count).toBe(30);
    expect(r.breakdown).toEqual([{ label: "TYT Fizik Branş", count: 30 }]);
  });

  it("without titles it keeps the old, coarser rule (every general exam counts toward the TYT courses)", () => {
    const bare = [{ id: "g", task_date: "2026-10-01", task_type: "general_exam", course_id: null }];
    expect(computeGelisimHaritasi([FIZIK], bare, [])[0].windowSize).toBe(1);
  });
});

describe("the Tümü / Genel / Branş switch", () => {
  it("renders three options, Tümü selected by default", () => {
    const html = renderToStaticMarkup(<TrialSourceSwitch value="all" onChange={() => {}} />);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/aria-checked="true"[^>]*>Tümü</);
    expect(html).toContain("Genel Deneme");
    expect(html).toContain("Branş Denemesi");
  });

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  it("student map: a date range (Son 30 Gün) and Tümü first, the trial breakdown line, no combined chips", () => {
    // the real YKS list, combined courses included: they produce no rows and no chips
    const recent: TrialExam[] = [
      exam({ id: "rg", task_type: "general_exam", title: "TYT Genel Deneme - A", task_date: daysAgo(3), subject_scores: tytScores }),
      exam({ id: "rg2", task_type: "general_exam", title: "TYT Genel Deneme - B", task_date: daysAgo(10), subject_scores: tytScores }),
      exam({ id: "old", task_type: "general_exam", title: "TYT Genel Deneme - C", task_date: daysAgo(120), subject_scores: tytScores }),
    ];
    const html = renderToStaticMarkup(<GelisimHaritasi exams={recent} mistakes={[]} courseIds={YKS_CURRICULUM_COURSE_IDS} examType="YKS" />);
    expect(html).toMatch(/aria-checked="true"[^>]*>Tümü</);
    expect(html).toContain("Son 30 Gün");
    expect(html).toContain('data-slot="range-summary"');
    expect(html).toContain('data-slot="trial-breakdown"');
    // the first chip (Türkçe): the two exams inside the range count, the 120-day-old one does not
    expect(html).toContain("Bu aralıkta 2 deneme: 2 Genel Deneme.");
    expect(html).not.toContain(">TYT Fen<");
    expect(html).not.toContain(">TYT Sosyal<");
    expect(html).not.toContain("Son 8");
  });
});

describe("Aylık Karne uses the same unified computation over its cycle's dates", () => {
  const cycleExams: TrialExam[] = [
    exam({ id: "k-in-g", task_type: "general_exam", title: "TYT Genel Deneme - A", task_date: "2026-10-05", subject_scores: tytScores }),
    exam({ id: "k-in-m", course_id: "tyt-fen-macro", title: "TYT Fen Branş Denemesi - B", task_date: "2026-10-08" }),
    exam({ id: "k-pending", course_id: "tyt-fen-macro", title: "TYT Fen Branş Denemesi - C", task_date: "2026-10-09", analysis_pending: true }),
    exam({ id: "k-out", course_id: FIZIK, title: "TYT Fizik Branş Denemesi - D", task_date: "2026-09-01" }),
  ];
  const marks = [
    { task_id: "k-in-m", course_id: "tyt-fen-macro", topic_id: topic(FIZIK) },
    { task_id: "k-in-g", course_id: FIZIK, topic_id: topic(FIZIK) },
    { task_id: "k-out", course_id: FIZIK, topic_id: topic(FIZIK) },
  ];

  it("folds a combined exam onto its subjects, leaves pending analyses out and stays inside the range", () => {
    const rows = computeAylikKarne([FIZIK, "tyt-fen-macro"], cycleExams, marks, "2026-10-01", "2026-10-28");
    const r = rows.find((x) => x.courseId === FIZIK && x.topicId === topic(FIZIK))!;
    expect(r.windowSize).toBe(2); // the Genel + the macro exam; not the pending one, not the September one
    expect(r.count).toBe(2);
    expect(rows.some((x) => x.courseId === "tyt-fen-macro")).toBe(false);
    // the stored snapshot keeps its old shape
    expect(Object.keys(r).sort()).toEqual(["count", "courseId", "courseName", "topicId", "topicName", "windowSize"]);
  });

  it("matches the Gelişim Haritası for the same exams", () => {
    const inRange = cycleExams.filter((e) => e.task_date >= "2026-10-01" && e.task_date <= "2026-10-28");
    const map = computeGelisimHaritasi([FIZIK], inRange, marks).find((x) => x.topicId === topic(FIZIK))!;
    const karne = computeAylikKarne([FIZIK], cycleExams, marks, "2026-10-01", "2026-10-28").find((x) => x.topicId === topic(FIZIK))!;
    expect([karne.count, karne.windowSize]).toEqual([map.count, map.windowSize]);
  });
});

describe("Konu Performans Haritası (coach, all-time)", () => {
  const detail = (e: TrialExam, approved = true) =>
    ({ ...e, is_coach_assigned: approved, is_approved_by_coach: approved, description: null }) as unknown as DetailTask;
  const html = (generals: TrialExam[], branches: TrialExam[]) =>
    renderToStaticMarkup(
      <TopicPerformanceMap
        generalExams={generals.map((e) => detail(e))}
        branchExams={branches.map((e) => detail(e))}
        examMistakes={mistakes}
        curriculumCourseIds={YKS_CURRICULUM_COURSE_IDS}
        questionTotals={{}}
        examType="YKS"
      />,
    );

  it("one chip per atomic subject, the Tümü / Genel / Branş switch, and the whole history in the sample line", () => {
    const out = html(exams.filter((e) => e.task_type === "general_exam"), exams.filter((e) => e.task_type === "branch_exam"));
    expect(out).toMatch(/aria-checked="true"[^>]*>Tümü</);
    expect(out).toContain('data-slot="trial-source-switch"');
    expect(out).toContain("Tüm zamanlarda");
    expect(out).not.toContain(">TYT Fen<");
  });

  it("is the same computation as the Gelişim Haritası (an unapproved self-created exam is left out)", () => {
    const unapproved = detail(exams[0], false);
    const out = renderToStaticMarkup(
      <TopicPerformanceMap
        generalExams={[unapproved]}
        branchExams={[]}
        examMistakes={[]}
        curriculumCourseIds={YKS_CURRICULUM_COURSE_IDS}
        questionTotals={{}}
        examType="YKS"
      />,
    );
    expect(out).not.toContain('data-slot="trial-breakdown"'); // Türkçe (first chip) has no trial at all
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("the student page hands over the raw history, read page by page, with what the coverage needs", () => {
    const page = read("../app/student/deneme-analizleri/gelisim-haritasi/page.tsx");
    expect(page).toContain("fetchAllPages<");
    expect(page).toContain('"id, task_date, task_type, course_id, title, subject_scores, analysis_pending"');
    expect(page).not.toContain("computeGelisimHaritasi");
    const view = read("../app/student/deneme-analizleri/_components/gelisim-haritasi.tsx");
    expect(view).toContain("<ChartRangePicker");
    expect(view).toContain("LAST_30_DAYS_RANGE");
    expect(view).not.toMatch(/WINDOW_SIZE|Son 8|slice\(0, /);
  });

  it("the coach's maps rely on the existing date range / all-time history, with no cap and no second copy of the counting", () => {
    const page = read("../app/coach/students/[id]/page.tsx");
    expect(page).not.toContain("courseExamCounts");
    expect(page).not.toContain("computeGelisimHaritasi(");
    const tab = read("../app/coach/students/[id]/_components/gelisim-haritasi-tab.tsx");
    expect(tab).toContain("<TrialSourceSwitch");
    expect(tab).toContain("{ source }");
    expect(tab).toContain("isDateInChartRange(e.task_date, chartRange)");
    const lib = read("./gelisim-haritasi.ts");
    expect(lib).not.toMatch(/WINDOW_SIZE|\.slice\(0, limit\)/);
  });

  it("the legacy Aylık Karne no longer carries its own copy of the course / exam matching", () => {
    const karne = read("./karne.ts");
    expect(karne).toContain("computeGelisimHaritasi(courseIds, inRange, mistakeRows)");
    expect(karne).not.toContain("GENERAL_EXAM_COURSE_IDS");
  });
});
