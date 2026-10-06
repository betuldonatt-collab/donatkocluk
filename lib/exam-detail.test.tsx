import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExamDetailView, type ExamDetailExam } from "@/components/exam-detail-view";
import { StackedBarChart } from "@/app/coach/students/[id]/_components/charts/stacked-bar-chart";
import { DualMetricChart } from "@/app/coach/students/[id]/_components/charts/dual-metric-chart";
import { findCourseById } from "./curriculum";
import { flattenSelectionRows } from "./curriculum/rows";
import { comparableGeneralExams, examPublisher, examScoreTotals, examTrackOf, generalExamTabs, markedRowCount, subjectScoreSummary } from "./exam-detail";
import { ExamComparisonView } from "@/components/exam-comparison-view";

const score = (correct: number, wrong: number, empty: number) => ({ correct, wrong, empty });
const firstTopicId = (courseId: string, n = 0) => flattenSelectionRows(findCourseById(courseId)!)[n].memberTopicIds[0];

const tytScores = { turkce: score(30, 8, 2), sosyal: score(15, 4, 1), matematik: score(25, 10, 5), fen: score(10, 6, 4) };
const exam = (over: Partial<ExamDetailExam> = {}): ExamDetailExam => ({
  id: "e1",
  title: "TYT Genel Deneme - 3D Yayınları",
  task_date: "2026-10-01",
  task_type: "general_exam",
  course_id: null,
  total_count: 120,
  correct_count: null,
  wrong_count: null,
  empty_count: null,
  duration_minutes: null,
  subject_scores: tytScores,
  analysis_pending: false,
  ...over,
});

describe("which tabs an exam has", () => {
  it("reads the track from the title", () => {
    expect(examTrackOf("TYT Genel Deneme - X")).toBe("tyt");
    expect(examTrackOf("AYT Genel Deneme - X")).toBe("ayt");
    expect(examTrackOf("LGS Genel Deneme - X")).toBe("lgs");
    expect(examTrackOf("7. SINIF Genel Deneme - X")).toBe("m7");
    expect(examTrackOf("9. SINIF Genel Deneme - X")).toBe("m9");
    expect(examTrackOf("10. SINIF Genel Deneme - X")).toBe("m10");
    expect(examTrackOf("11. SINIF Genel Deneme - X")).toBe("m11");
  });

  it("TYT: Türkçe, Sosyal Bilimler, Matematik, Fen -- each with its curriculum courses", () => {
    const tabs = generalExamTabs(exam());
    expect(tabs.map((t) => t.key)).toEqual(["turkce", "sosyal", "matematik", "fen"]);
    expect(tabs.map((t) => t.label)).toEqual(["Türkçe", "Sosyal Bilimler", "Matematik", "Fen Bilimleri"]);
    expect(tabs.find((t) => t.key === "sosyal")!.courses.map((c) => c.id)).toEqual(["tyt-tarih", "tyt-cografya", "tyt-felsefe", "tyt-din"]);
    expect(tabs.find((t) => t.key === "fen")!.courses.map((c) => c.id)).toEqual(["tyt-fizik", "tyt-kimya", "tyt-biyoloji"]);
  });

  it("AYT: the track comes from the score keys (Sayısal vs Sözel)", () => {
    const sayisal = generalExamTabs(exam({ title: "AYT Genel Deneme - X", subject_scores: { ayt_matematik: score(30, 5, 5), ayt_fizik: score(10, 2, 2) } }));
    expect(sayisal.map((t) => t.key)).toContain("ayt_fizik");
    expect(sayisal.find((t) => t.key === "ayt_matematik")!.courses.length).toBeGreaterThan(0);
    const ea = generalExamTabs(exam({ title: "AYT Genel Deneme - X", subject_scores: { ayt_ea_matematik: score(30, 5, 5) } }));
    expect(ea.map((t) => t.key)).toContain("ayt_ea_matematik");
    expect(ea.map((t) => t.key)).not.toContain("ayt_fizik");
    const sozel = generalExamTabs(exam({ title: "AYT Genel Deneme - X", subject_scores: { ayt_sozel_sozel1: score(20, 2, 2) } }));
    expect(sozel.map((t) => t.key)).toContain("ayt_sozel_sosyal2");
    expect(sozel.map((t) => t.key)).not.toContain("ayt_ea_matematik");
  });

  it("LGS: the six subjects", () => {
    const tabs = generalExamTabs(exam({ title: "LGS Genel Deneme - X", subject_scores: { lgs_turkce: score(18, 1, 1) } }));
    expect(tabs.map((t) => t.key)).toEqual(["lgs_turkce", "lgs_inkilap", "lgs_din", "lgs_ingilizce", "lgs_matematik", "lgs_fen"]);
    expect(tabs[0].courses.map((c) => c.id)).toEqual(["lgs-turkce"]);
  });

  it("7th / 9th / 10th grade: that grade's own subjects; 11th: the TYT-structured groups over the merged courses", () => {
    expect(generalExamTabs(exam({ title: "7. SINIF Genel Deneme - X" })).map((t) => t.key)).toEqual(["m7_turkce", "m7_sosyal", "m7_din", "m7_ingilizce", "m7_matematik", "m7_fen"]);
    expect(generalExamTabs(exam({ title: "9. SINIF Genel Deneme - X" })).length).toBeGreaterThan(3);
    expect(generalExamTabs(exam({ title: "10. SINIF Genel Deneme - X" })).length).toBeGreaterThan(3);
    const m11 = generalExamTabs(exam({ title: "11. SINIF Genel Deneme - X" }));
    expect(m11.map((t) => t.key)).toEqual(["turkce", "sosyal", "matematik", "fen"]);
    expect(m11.some((t) => t.courses.length > 0)).toBe(true);
  });
});

describe("scores", () => {
  it("nets a TYT subject 4:1 and an LGS / 7th-grade one 3:1, and the whole exam once on the totals", () => {
    expect(subjectScoreSummary(tytScores, "matematik", "tyt")).toEqual({ correct: 25, wrong: 10, empty: 5, net: 22.5 });
    expect(subjectScoreSummary({ lgs_matematik: score(15, 6, 0) }, "lgs_matematik", "lgs")?.net).toBe(13);
    expect(subjectScoreSummary(tytScores, "nope", "tyt")).toBeNull();
    expect(subjectScoreSummary(null, "turkce", "tyt")).toBeNull();
    // totals: 80 D, 28 Y, 12 B -> 80 - 28/4 = 73
    expect(examScoreTotals(tytScores, "tyt")).toEqual({ correct: 80, wrong: 28, empty: 12, net: 73 });
    expect(examScoreTotals(null, "tyt")).toBeNull();
    expect(examScoreTotals({}, "tyt")).toBeNull();
  });

  it("counts a row once even when it rolls up several marked topics", () => {
    const rows = [{ memberTopicIds: ["a", "b"] }, { memberTopicIds: ["c"] }, { memberTopicIds: ["d"] }];
    expect(markedRowCount(rows, new Set(["a", "b", "c"]))).toBe(2);
    expect(markedRowCount(rows, new Set())).toBe(0);
  });
});

describe("ExamDetailView", () => {
  const mathMarked = new Set([firstTopicId("tyt-matematik", 0), firstTopicId("tyt-matematik", 3)]);
  const html = (props: { e?: ExamDetailExam; marked?: Set<string>; tab?: string }) =>
    renderToStaticMarkup(<ExamDetailView exam={props.e ?? exam()} markedTopicIds={props.marked ?? new Set()} initialTabKey={props.tab} />);

  it("a Genel Deneme shows the subject tabs, the exam's totals and the active subject's own scores", () => {
    const out = html({ marked: mathMarked, tab: "matematik" });
    expect(out).toContain('role="tablist"');
    for (const label of ["Türkçe", "Sosyal Bilimler", "Matematik", "Fen Bilimleri"]) expect(out).toContain(label);
    expect(out).toContain("73.00"); // whole exam net
    expect(out).toContain("22.50"); // Matematik net
    expect(out).not.toContain("27.50"); // Türkçe net (30 - 8/4 = 28 -> only the active subject's strip)
  });

  it("each tab shows its own course tables, with an X on marked topics only (and the count)", () => {
    const math = html({ marked: mathMarked, tab: "matematik" });
    expect(math).toContain('aria-label="Matematik konuları"');
    expect((math.match(/aria-label="İşaretli"/g) ?? []).length).toBe(2);
    expect(math).toContain("2 konu işaretli");
    // the Türkçe tab has none of those marks
    const turkce = html({ marked: mathMarked, tab: "turkce" });
    expect(turkce).toContain('aria-label="Türkçe konuları"');
    expect((turkce.match(/aria-label="İşaretli"/g) ?? []).length).toBe(0);
    expect(turkce).toContain("0 konu işaretli");
    // Sosyal lists all four of its courses
    const sosyal = html({ tab: "sosyal" });
    for (const name of ["Tarih", "Coğrafya", "Felsefe", "Din"]) expect(sosyal).toContain(`aria-label="${name} konuları"`);
  });

  it("the tab badge counts the marked rows of that subject", () => {
    const out = html({ marked: mathMarked, tab: "turkce" });
    expect(out).toMatch(/Matematik<span[^>]*>2<\/span>/);
  });

  it("an exam waiting for its topic analysis says so but still shows the scores", () => {
    const out = html({ e: exam({ analysis_pending: true }) });
    expect(out).toContain("Analiz Bekliyor");
    expect(out).toContain("73.00");
  });

  it("a Branş Denemesi shows its own course table, net and duration -- no subject tabs", () => {
    const branch = exam({
      title: "TYT Branş Denemesi - 3D Yayınları",
      task_type: "branch_exam",
      course_id: "tyt-matematik",
      subject_scores: null,
      correct_count: 30,
      wrong_count: 8,
      empty_count: 2,
      duration_minutes: 40,
    });
    const out = html({ e: branch, marked: mathMarked });
    expect(out).not.toContain('role="tablist"');
    expect(out).toContain('aria-label="Matematik konuları"');
    expect(out).toContain("28.00"); // 30 - 8/4
    expect(out).toContain("40 dk");
    expect((out.match(/aria-label="İşaretli"/g) ?? []).length).toBe(2);
  });

  it("a branch exam's net rule can be overridden by the caller (cohort-aware 3:1)", () => {
    const branch = exam({ task_type: "branch_exam", course_id: "tyt-matematik", subject_scores: null, correct_count: 30, wrong_count: 9, empty_count: 0 });
    const out = renderToStaticMarkup(<ExamDetailView exam={branch} markedTopicIds={new Set()} netOf={(c, w) => c - w / 3} />);
    expect(out).toContain("27.00");
  });

  it("an exam with no scores entered yet shows an honest empty strip instead of zeros", () => {
    const out = html({ e: exam({ subject_scores: null }) });
    expect(out).toContain("henüz sonuç girilmemiş");
  });
});

describe("the charts stay inert unless asked to report clicks", () => {
  const series = [{ key: "a", label: "A", color: "red" }];
  it("adds the pointer cursor only when onSelect is given", () => {
    const stacked = [{ id: "e1", date: "2026-10-01", values: { a: 10 } }];
    expect(renderToStaticMarkup(<StackedBarChart data={stacked} series={series} />)).not.toContain("cursor-pointer");
    expect(renderToStaticMarkup(<StackedBarChart data={stacked} series={series} onSelect={() => {}} />)).toContain("cursor-pointer");
    const dual = [{ id: "e1", date: "2026-10-01", a: 10, b: 30 }];
    expect(renderToStaticMarkup(<DualMetricChart data={dual} labelA="Net" labelB="Süre" />)).not.toContain("cursor-pointer");
    expect(renderToStaticMarkup(<DualMetricChart data={dual} labelA="Net" labelB="Süre" onSelect={() => {}} />)).toContain("cursor-pointer");
  });

  it("two exams on the same day each get their own bar", () => {
    const data = [
      { id: "e1", date: "2026-10-01", values: { a: 10 } },
      { id: "e2", date: "2026-10-01", values: { a: 20 } },
    ];
    const out = renderToStaticMarkup(<StackedBarChart data={data} series={series} onSelect={() => {}} />);
    expect((out.match(/<rect /g) ?? []).length).toBe(2);
  });
});

describe("Genel Deneme side by side", () => {
  const e = (id: string, date: string, over: Partial<ExamDetailExam> = {}) => exam({ id, task_date: date, title: `TYT Genel Deneme - Yayın ${id.toUpperCase()}`, ...over });
  const a = e("a", "2026-09-01", { subject_scores: { ...tytScores, matematik: score(20, 10, 10) } });
  const b = e("b", "2026-09-15", { subject_scores: { ...tytScores, matematik: score(28, 6, 6) } });
  const c = e("c", "2026-10-01", { analysis_pending: true });
  const ayt = e("x", "2026-09-10", { title: "AYT Genel Deneme - X", subject_scores: { ayt_matematik: score(30, 5, 5), ayt_fizik: score(10, 2, 2) } });
  const aytSozel = e("y", "2026-09-12", { title: "AYT Genel Deneme - Y", subject_scores: { ayt_sozel_sozel1: score(20, 2, 2) } });
  const branch = e("br", "2026-09-05", { task_type: "branch_exam", course_id: "tyt-matematik", title: "TYT Branş Denemesi - Z" });
  const mathId = (n: number) => firstTopicId("tyt-matematik", n);

  it("comparableGeneralExams: same track only, oldest first, no branch exams", () => {
    expect(comparableGeneralExams([c, ayt, b, branch, a], a).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(comparableGeneralExams([ayt, aytSozel, a], ayt).map((x) => x.id)).toEqual(["x"]); // Sayısal vs Sözel AYT stay apart
    expect(comparableGeneralExams([a, b, c], c).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(examPublisher("TYT Genel Deneme - 3D Yayınları")).toBe("3D Yayınları");
    expect(examPublisher("TYT Genel Deneme")).toBe("—");
  });

  const html = (props: { focus?: string; tab?: string; marked?: Record<string, string[]>; onEdit?: boolean; exams?: ExamDetailExam[] }) =>
    renderToStaticMarkup(
      <ExamComparisonView
        exams={props.exams ?? [a, b, c]}
        focusExamId={props.focus ?? "b"}
        initialTabKey={props.tab}
        markedByExam={new Map(Object.entries(props.marked ?? {}).map(([id, topics]) => [id, new Set(topics)]))}
        onEdit={props.onEdit === false ? undefined : () => {}}
      />,
    );

  it("every exam is a column, in order, with the active subject's own figures; the clicked one is highlighted", () => {
    const out = html({ tab: "matematik" });
    for (const publisher of ["Yayın A", "Yayın B", "Yayın C"]) expect(out).toContain(publisher);
    expect(out.indexOf("Yayın A")).toBeLessThan(out.indexOf("Yayın B"));
    expect(out.indexOf("Yayın B")).toBeLessThan(out.indexOf("Yayın C"));
    expect(out).toContain("D:20 Y:10 B:10"); // exam a, Matematik
    expect(out).toContain("Net 17.50");
    expect(out).toContain("D:28 Y:6 B:6"); // exam b
    expect(out).toContain("Net 26.50");
    // the Matematik tab lists two courses (Matematik, Geometri): the clicked exam's column is highlighted in each
    expect((out.match(/data-focused="true"/g) ?? []).length).toBe(2);
    expect(out).toMatch(/data-focused="true"[^>]*>[\s\S]{0,400}Yayın B/);
  });

  it("a topic shows an X only in the exams that marked it", () => {
    const t0 = mathId(0);
    const t3 = mathId(3);
    const out = html({ tab: "matematik", marked: { a: [t0], b: [t0, t3], c: [] } });
    const row = (name: string) => out.split("<tr").find((r) => r.includes(`>${name}<`) || r.includes(`>${name}`)) ?? "";
    const first = flattenSelectionRows(findCourseById("tyt-matematik")!);
    const xs = (r: string) => (r.match(/aria-label="İşaretli"/g) ?? []).length;
    expect(xs(row(first[0].label))).toBe(2); // a and b
    expect(xs(row(first[3].label))).toBe(1); // b only
    expect(xs(row(first[1].label))).toBe(0);
  });

  it("each subject tab shows its own courses across all exams", () => {
    expect(html({ tab: "fen" })).toContain('aria-label="Fizik konuları"');
    expect(html({ tab: "fen" })).toContain('aria-label="Biyoloji konuları"');
    expect(html({ tab: "turkce" })).toContain('aria-label="Türkçe konuları"');
    expect(html({ tab: "turkce" })).not.toContain('aria-label="Matematik konuları"');
    expect(html({ tab: "turkce" })).toContain("D:30 Y:8 B:2"); // Türkçe figures in the column heads
  });

  it("keeps 'Sonuçları Düzenle' reachable: one shortcut per exam column when the caller gives onEdit, none without", () => {
    const withEdit = html({ tab: "matematik" });
    expect((withEdit.match(/aria-label="Sonuçları Düzenle: /g) ?? []).length).toBe(3 * 2); // one per exam in each of the tab's two course tables
    expect(withEdit).toContain("Sonuçları Düzenle: TYT Genel Deneme - Yayın A");
    expect(html({ tab: "matematik", onEdit: false })).not.toContain("Sonuçları Düzenle");
  });

  it("flags exams whose topic analysis is still missing, and copes with no exams", () => {
    expect(html({ tab: "matematik" })).toContain("Analiz Bekliyor");
    expect(html({ tab: "matematik" })).toContain("1 denemenin konu analizi henüz girilmemiş");
    expect(renderToStaticMarkup(<ExamComparisonView exams={[]} focusExamId="zz" markedByExam={new Map()} />)).toContain("Karşılaştırılacak deneme yok");
  });

  it("an exam without scores for the subject says so instead of showing zeros", () => {
    const noScores = e("n", "2026-10-05", { subject_scores: null });
    expect(html({ tab: "matematik", exams: [a, noScores], focus: "a" })).toContain("sonuç yok");
  });
});
