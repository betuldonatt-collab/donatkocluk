import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GelisimHaritasi } from "@/app/student/deneme-analizleri/_components/gelisim-haritasi";
import { TrialSourceSwitch } from "@/components/trial-source-switch";
import { findCourseById, macroSourceCourseIds, macroTopicCourseId } from "./curriculum";
import { YKS_CURRICULUM_COURSE_IDS } from "./curriculum/cohort";
import { computeGelisimHaritasi, computeGelisimHaritasiBySource, type TrialExam } from "./gelisim-haritasi";

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
    const bySource = computeGelisimHaritasiBySource(ids, exams, mistakes);
    expect(rowOf(bySource.all, FIZIK, topic(FIZIK)).windowSize).toBe(3);
    expect(rowOf(bySource.general, FIZIK, topic(FIZIK)).windowSize).toBe(1);
    expect(rowOf(bySource.general, FIZIK, topic(FIZIK)).count).toBe(1);
    expect(rowOf(bySource.branch, FIZIK, topic(FIZIK)).windowSize).toBe(2);
    expect(rowOf(bySource.branch, FIZIK, topic(FIZIK)).count).toBe(2);
  });

  it("windows to the newest 8 by default and takes the whole history with limit Infinity (the all-time map)", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      exam({ id: `s${i}`, course_id: FIZIK, title: `T${i}`, task_date: `2026-09-${String(i + 1).padStart(2, "0")}` }),
    );
    const marks = many.map((e) => ({ task_id: e.id, course_id: FIZIK, topic_id: topic(FIZIK) }));
    expect(rowOf(computeGelisimHaritasi([FIZIK], many, marks), FIZIK, topic(FIZIK)).windowSize).toBe(8);
    const all = rowOf(computeGelisimHaritasi([FIZIK], many, marks, { limit: Infinity }), FIZIK, topic(FIZIK));
    expect(all.windowSize).toBe(11);
    expect(all.count).toBe(11);
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

  it("student map: Tümü first, the course's trial breakdown line, and no combined chips", () => {
    // the real YKS list, combined courses included: they produce no rows and no chips
    const bySource = computeGelisimHaritasiBySource(YKS_CURRICULUM_COURSE_IDS, exams, mistakes);
    const html = renderToStaticMarkup(<GelisimHaritasi rowsBySource={bySource} examType="YKS" />);
    expect(html).toMatch(/aria-checked="true"[^>]*>Tümü</);
    expect(html).toContain('data-slot="trial-breakdown"');
    // the first chip (Türkçe) is shown: only the TYT Genel Deneme is about it
    expect(html).toContain("Son 1 deneme: 1 Genel Deneme.");
    expect(html).not.toContain(">TYT Fen<");
    expect(html).not.toContain(">TYT Sosyal<");
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("the student page hands the three source variants over and fetches what the coverage needs", () => {
    const page = read("../app/student/deneme-analizleri/gelisim-haritasi/page.tsx");
    expect(page).toContain("computeGelisimHaritasiBySource(");
    expect(page).toContain('.select("id, task_date, task_type, course_id, title, subject_scores, analysis_pending")');
  });

  it("the coach's all-time map is the same computation, unbounded -- not a second copy of the counting", () => {
    const page = read("../app/coach/students/[id]/page.tsx");
    expect(page).toContain("computeGelisimHaritasi(");
    expect(page).toContain("limit: Infinity");
    expect(page).not.toContain("courseExamCounts");
    const tab = read("../app/coach/students/[id]/_components/gelisim-haritasi-tab.tsx");
    expect(tab).toContain("<TrialSourceSwitch");
    expect(tab).toContain("{ source }");
  });
});
