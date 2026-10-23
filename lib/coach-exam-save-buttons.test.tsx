import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => ({
  saveCoachTrialResults: vi.fn(),
  getTaskTopicMistakesForCoach: vi.fn(() => new Promise(() => {})),
}));

import { TrialResultsSection } from "@/app/coach/students/[id]/_components/kanban/trial-results-section";
import type { DetailTask } from "@/app/coach/students/[id]/types";

// The coach's drawer for an existing Branş / Genel exam has TWO save buttons that save different things (results + analysis vs. the task's
// details). Same code, clearer words: each says what it alone saves, and the results box explains the split.

const exam = (task_type: string) =>
  ({ id: "t1", title: "TYT Branş Denemesi - Yayın", task_type, subject_scores: null, total_count: null, correct_count: null, wrong_count: null, empty_count: null, course_id: "tyt-fizik" }) as unknown as DetailTask;

describe("the results box", () => {
  const html = renderToStaticMarkup(<TrialResultsSection studentId="s1" task={exam("branch_exam")} onSaved={() => {}} />);

  it("has one button, named for what it saves: the results and the analysis", () => {
    expect(html).toContain("Sonuçları ve Analizi Kaydet");
    expect(html).not.toContain(">Sonuçları Kaydet<");
  });

  it("says what that button does, and that the task's details are saved separately below", () => {
    expect(html).toContain('data-slot="results-save-hint"');
    expect(html).toContain("denemeyi “Yapıldı” yapar ve analizi tamamlanmış sayar");
    expect(html).toContain("alttaki düğmeyle kaydedilir");
  });
});

describe("the drawer footer", () => {
  const src = readFileSync("app/coach/students/[id]/_components/kanban/task-drawer.tsx", "utf8");

  it("is named 'Görev Bilgilerini Kaydet' when an existing exam is edited, and stays 'Kaydet' for every other task", () => {
    expect(src).toContain("const isExamEdit = state.mode === \"edit\" &&");
    expect(src).toMatch(/isExamEdit\s*\?\s*"Görev Bilgilerini Kaydet"\s*:\s*"Kaydet"/);
  });

  it("still saves through the same two separate actions (nothing was merged)", () => {
    expect(src).toContain("updateAssignedTask(studentId, state.task.id, payload)");
    expect(src).toContain("<TrialResultsSection");
    const section = readFileSync("app/coach/students/[id]/_components/kanban/trial-results-section.tsx", "utf8");
    expect(section).toContain("saveCoachTrialResults(");
    expect(section).not.toContain("updateAssignedTask(");
  });

  it("the student's modal is untouched: still its own Kaydet / Devam Et: Konu Analizi flow", () => {
    const modal = readFileSync("app/student/_components/daily-tasks/task-modal.tsx", "utf8");
    expect(modal).toContain("Devam Et: Konu Analizi");
    expect(modal).not.toContain("Sonuçları ve Analizi Kaydet");
    expect(modal).not.toContain("Görev Bilgilerini Kaydet");
  });
});
