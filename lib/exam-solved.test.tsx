import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The dialog is replaced by plain wrappers so its content is part of the static markup.
vi.mock("@/components/ui/dialog", () => {
  const Wrap = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: Wrap, DialogContent: Wrap, DialogDescription: Wrap, DialogFooter: Wrap, DialogHeader: Wrap, DialogTitle: Wrap };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { ExamDetailDialog } from "@/app/coach/students/[id]/_components/exam-detail-dialog";
import { PendingAnalysisBox } from "@/components/pending-analysis-box";
import { examHasResults, examIsSolved, examNeedsAnalysis, splitExamsByAnalysis } from "./exam-solved";
import { computeNet } from "./scoring";

describe("what makes an exam solved / unanalysed", () => {
  const none = { correct_count: null, wrong_count: null, empty_count: null, subject_scores: null, analysis_pending: false };

  it("no results at all = unsolved (the coach's target alone, or a status painted by hand, changes nothing)", () => {
    expect(examHasResults(none)).toBe(false);
    expect(examIsSolved(none)).toBe(false);
    expect(examHasResults({ ...none, subject_scores: {} })).toBe(false);
    expect(examHasResults({})).toBe(false);
  });

  it("any of Doğru / Yanlış / Boş entered, or per-subject scores, = has results (a zero is a result)", () => {
    expect(examHasResults({ ...none, correct_count: 0 })).toBe(true);
    expect(examHasResults({ ...none, wrong_count: 3 })).toBe(true);
    expect(examHasResults({ ...none, empty_count: 1 })).toBe(true);
    expect(examHasResults({ ...none, subject_scores: { turkce: { correct: 20, wrong: 5, empty: 15 } } })).toBe(true);
  });

  it("analysis_pending is the one 'not analysed yet' flag, and it always counts as solved", () => {
    expect(examNeedsAnalysis({ ...none, correct_count: 9, analysis_pending: true })).toBe(true);
    expect(examNeedsAnalysis({ ...none, correct_count: 9, analysis_pending: false })).toBe(false);
    expect(examNeedsAnalysis({ ...none, correct_count: 9 })).toBe(false);
    expect(examIsSolved({ ...none, analysis_pending: true })).toBe(true);
  });

  it("splitExamsByAnalysis: analysed rows stay in order, pending ones are set apart, unsolved ones are dropped", () => {
    const list = [
      { id: "a", ...none, correct_count: 5 },
      { id: "u", ...none },
      { id: "p", ...none, correct_count: 7, analysis_pending: true },
      { id: "b", ...none, wrong_count: 2 },
    ];
    const { analyzed, pending } = splitExamsByAnalysis(list);
    expect(analyzed.map((e) => e.id)).toEqual(["a", "b"]);
    expect(pending.map((e) => e.id)).toEqual(["p"]);
  });
});

describe("PendingAnalysisBox", () => {
  const exam = { id: "e1", title: "TYT Genel Deneme - Yayın X", task_date: "2026-10-10", total_count: 120, correct_count: 80, wrong_count: 20, empty_count: 20 };

  it("is a yellow warning box with an exclamation, listing each exam with its numbers and an action", () => {
    const html = renderToStaticMarkup(<PendingAnalysisBox exams={[exam]} onOpen={() => {}} />);
    expect(html).toContain("border-amber-500");
    expect(html).toContain("bg-amber-500/10");
    expect(html).toContain("lucide-triangle-alert");
    expect(html).toContain("Analizi bekleyen denemeler");
    expect(html).toContain("TYT Genel Deneme - Yayın X");
    expect(html).toContain("T:120 D:80 Y:20 B:20");
    expect(html).toContain("Analizi Yap");
  });

  it("renders nothing for no exams", () => {
    expect(renderToStaticMarkup(<PendingAnalysisBox exams={[]} onOpen={() => {}} />)).toBe("");
  });
});

describe("the coach's comparison popup (the blurred dialog)", () => {
  const exam = (id: string, date: string, over: Record<string, unknown> = {}) =>
    ({
      id,
      task_type: "branch_exam",
      course_id: "tyt-fizik",
      task_date: date,
      title: `TYT Fizik Branş Denemesi - Yayın ${id}`,
      total_count: 14,
      correct_count: 9,
      wrong_count: 3,
      empty_count: 2,
      subject_scores: null,
      analysis_pending: false,
      ...over,
    }) as never;
  const analysed = exam("OK", "2026-10-10");
  const waiting = exam("BEKLEYEN", "2026-10-12", { analysis_pending: true });
  const unsolved = exam("BOS", "2026-10-14", { correct_count: null, wrong_count: null, empty_count: null });

  const render = (focus: unknown) =>
    renderToStaticMarkup(
      <ExamDetailDialog
        exam={focus as never}
        allGeneralExams={[]}
        allBranchExams={[analysed, waiting, unsolved]}
        isInRange={() => true}
        rangeLabel="Son 30 gün"
        markedByExam={new Map()}
        netOf={computeNet}
        onClose={() => {}}
        onEdit={() => {}}
      />,
    );

  it("lists only analysed exams as columns, puts the pending one in the yellow box on the right, and hides the unsolved one", () => {
    const html = render(analysed);
    expect(html).toContain("Yayın OK");
    expect(html).not.toContain("Yayın BOS");
    const box = html.slice(html.indexOf('data-slot="pending-analysis-box"'));
    expect(box).toContain("Yayın BEKLEYEN");
    expect(html.indexOf("Yayın OK")).toBeLessThan(html.indexOf('data-slot="pending-analysis-box"'));
    expect(html).toContain("lg:flex-row");
  });

  it("opening the popup from an unanalysed exam does not crash and still shows it in the box", () => {
    const html = render(waiting);
    expect(html).toContain('data-slot="pending-analysis-box"');
    expect(html).toContain("Yayın BEKLEYEN");
  });

  it("with nothing analysed yet it says so instead of an empty comparison", () => {
    const html = renderToStaticMarkup(
      <ExamDetailDialog
        exam={waiting}
        allGeneralExams={[]}
        allBranchExams={[waiting]}
        isInRange={() => true}
        rangeLabel="Son 30 gün"
        markedByExam={new Map()}
        netOf={computeNet}
        onClose={() => {}}
        onEdit={() => {}}
      />,
    );
    expect(html).toContain("Analizi tamamlanmış deneme yok");
    expect(html).toContain("Yayın BEKLEYEN");
  });
});

describe("wiring", () => {
  it("the student's Branş page counts and lists only solved exams", () => {
    const src = readFileSync("app/student/deneme-analizleri/brans/brans-analysis-client.tsx", "utf8");
    expect(src).toContain("examIsSolved");
    expect(src).toContain("solvedExams");
  });
  it("both tables and the popup go through the one shared rule", () => {
    for (const file of [
      "app/student/deneme-analizleri/_components/exam-topic-table.tsx",
      "app/coach/students/[id]/_components/coach-exam-topic-table.tsx",
      "app/coach/students/[id]/_components/exam-detail-dialog.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("splitExamsByAnalysis(");
      expect(src, file).toContain("<PendingAnalysisBox");
    }
  });
  it("the Parent panel is not touched", () => {
    expect(readFileSync("app/parent/karne/page.tsx", "utf8")).not.toContain("exam-solved");
  });
});
