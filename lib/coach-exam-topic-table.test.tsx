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

  const exams = [exam("c", "2026-10-17"), exam("b", "2026-10-10"), exam("a", "2026-10-03", true)];
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
    expect(html).toContain("Analiz Bekliyor");
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
