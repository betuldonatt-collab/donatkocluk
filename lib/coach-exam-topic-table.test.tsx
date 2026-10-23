import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { CoachExamTopicTable } from "@/app/coach/students/[id]/_components/coach-exam-topic-table";
import { findCourseById } from "./curriculum";
import { flattenSelectionRows } from "./curriculum/rows";

// The coach's Analiz-tab topics x exams table: the same sticky header row and "Tekrar" column as the student's table and the Grafikler popup.

describe("CoachExamTopicTable: Tekrar column and sticky header", () => {
  const course = findCourseById("tyt-fizik")!;
  const rows = flattenSelectionRows(course);
  const [a, b] = [rows[0].memberTopicIds[0], rows[1].memberTopicIds[0]];

  const exam = (id: string, date: string, pending = false) =>
    ({
      id,
      task_date: date,
      title: `TYT Branş Denemesi - Yayın ${id}`,
      total_count: 14,
      correct_count: 9,
      wrong_count: 3,
      empty_count: 2,
      analysis_pending: pending,
    }) as never;
  const render = (exams: unknown[], marks: Record<string, Set<string>>) =>
    renderToStaticMarkup(
      <CoachExamTopicTable course={course} exams={exams as never} mistakesByExam={marks} onOpenExam={() => {}} onDelete={() => {}} />,
    );

  const exams = [exam("c", "2026-10-17"), exam("b", "2026-10-10"), exam("a", "2026-10-03")];
  const marks = { c: new Set([a]), b: new Set([a, b]), a: new Set([a]) };
  const html = render(exams, marks);

  it("counts, per topic, in how many of the shown exams it was marked, and tints the repeated ones", () => {
    const counts = [...html.matchAll(/class="[^"]*" data-count="(\d+)"/g)].map((m) => Number(m[1]));
    expect(counts.slice(0, 3)).toEqual([3, 1, 0]);
    expect(html).toContain("3/3");
    expect(html).toContain("1/3");
    expect(html).toContain(">Tekrar</th>");
    expect(html).toMatch(/text-rose-700[^"]*" data-count="3"/);
    expect(html).not.toMatch(/text-rose-700[^"]*" data-count="1"/);
  });

  it("the exam headings and the Ünite / Konu / Tekrar columns stay in place inside a height-bounded frame", () => {
    expect(html).toContain("max-h-[70dvh]");
    expect(html).toMatch(/<th[^>]*sticky top-0[^>]*>Konu<\/th>/);
    expect(html).toMatch(/<th[^>]*sticky top-0[^>]*>Tekrar<\/th>/);
    expect((html.match(/sticky top-0 z-30/g) ?? []).length).toBe(exams.length);
  });

  it("keeps the coach's own header: T/D/Y/B, the edit button and the delete button per exam", () => {
    expect(html).toContain("T:14 D:9 Y:3 B:2");
    expect(html).toContain("Sonuçları Düzenle");
    expect(html.match(/aria-label="Denemeyi sil"/g)).toHaveLength(3);
  });

  it("with fewer than two exams there is no Tekrar column; with none, the topics are still listed", () => {
    const one = render([exam("c", "2026-10-17")], { c: new Set([a]) });
    expect(one).not.toContain("Tekrar");
    expect(one).not.toContain("data-count");
    const none = render([], {});
    expect(none).not.toContain("Tekrar");
    expect(none).toContain("henüz çözülmüş bir branş veya genel deneme yok");
    expect(none).toContain(rows[0].label);
  });
});


// ---------------------------------------------------------------------------------------------------------------------------------
describe("CoachExamTopicTable: unsolved exams are hidden, unanalysed ones sit in the yellow box", () => {
  const course = findCourseById("tyt-fizik")!;
  const rows = flattenSelectionRows(course);
  const topic = rows[0].memberTopicIds[0];

  const base = { task_date: "2026-10-10", total_count: 14 };
  // analysed: results in, analysis_pending false
  const analysed = { ...base, id: "ok1", title: "TYT Branş Denemesi - Yayın OK", correct_count: 9, wrong_count: 3, empty_count: 2, analysis_pending: false };
  // solved but not analysed
  const waiting = { ...base, id: "wait1", title: "TYT Branş Denemesi - Yayın BEKLEYEN", correct_count: 8, wrong_count: 4, empty_count: 2, analysis_pending: true };
  // unsolved: only the coach's target, no results
  const unsolved = { ...base, id: "none1", title: "TYT Branş Denemesi - Yayın ÇÖZÜLMEMİŞ", correct_count: null, wrong_count: null, empty_count: null, analysis_pending: false };
  // painted "Yapıldı" by the coach with nothing entered: still unsolved
  const paintedDone = { ...unsolved, id: "paint1", title: "TYT Branş Denemesi - Yayın BOYANMIŞ", status: "done" };
  const render = (exams: unknown[]) => renderToStaticMarkup(<CoachExamTopicTable course={course} exams={exams as never} mistakesByExam={marks} onOpenExam={() => {}} onDelete={() => {}} />);
  const marks = {} as Record<string, Set<string>>;

  it("an exam with no results at all is not listed anywhere (not even one painted 'Yapıldı')", () => {
    const html = render([analysed, unsolved, paintedDone]);
    expect(html).toContain("Yayın OK");
    expect(html).not.toContain("ÇÖZÜLMEMİŞ");
    expect(html).not.toContain("BOYANMIŞ");
    expect(html).not.toContain("pending-analysis-box");
  });

  it("a solved exam whose analysis is pending is not a table column: it is in the yellow box with its numbers, and no longer a 'pill' in the header", () => {
    const html = render([analysed, waiting]);
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    expect(table).toContain("Yayın OK");
    expect(table).not.toContain("BEKLEYEN");
    const box = html.slice(html.indexOf('data-slot="pending-analysis-box"'));
    expect(box).toContain("Analizi bekleyen denemeler");
    expect(box).toContain("Yayın BEKLEYEN");
    expect(box).toContain("T:14 D:8 Y:4 B:2");
    expect(html).toContain("lucide-triangle-alert"); // the warning (exclamation) icon
    expect(html).not.toContain("Analiz Bekliyor");
  });

  it("the box sits to the right of the table (a row layout on wide screens), not mixed into the list", () => {
    const html = render([analysed, waiting]);
    expect(html.indexOf('data-slot="exam-topic-frame"')).toBeLessThan(html.indexOf('data-slot="pending-analysis-box"'));
    expect(html).toContain("lg:flex-row");
  });

  it("the Tekrar column counts only the analysed exams", () => {
    const second = { ...analysed, id: "ok2", title: "TYT Branş Denemesi - Yayın OK2", task_date: "2026-10-03" };
    const html = renderToStaticMarkup(<CoachExamTopicTable course={course} exams={[analysed, second, waiting, unsolved] as never} mistakesByExam={{ ok1: new Set([topic]), ok2: new Set([topic]), wait1: new Set([topic]) }} onOpenExam={() => {}} onDelete={() => {}} />);
    expect(html).toContain("2/2");
    expect(html).not.toContain("3/3");
    expect(html).not.toContain("3/4");
  });

  it("only pending exams: no columns, an explanatory line, and the box", () => {
    const html = render([waiting]);
    expect(html).toContain("Analizi tamamlanmış deneme yok");
    expect(html).toContain("Yayın BEKLEYEN");
  });

  it("only unsolved exams: the plain empty state and no box", () => {
    const html = render([unsolved]);
    expect(html).toContain("henüz çözülmüş bir branş veya genel deneme yok");
    expect(html).not.toContain("pending-analysis-box");
  });

  it("a per-subject Genel Deneme counts as solved by its scores", () => {
    const general = { ...base, id: "g1", title: "TYT Genel Deneme - X", correct_count: null, wrong_count: null, empty_count: null, subject_scores: { turkce: { correct: 20, wrong: 5, empty: 15 } }, analysis_pending: false };
    expect(render([general])).toContain("T:14 D:— Y:— B:—");
    expect(render([general])).not.toContain("henüz çözülmüş");
  });
});
