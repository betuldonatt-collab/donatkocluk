import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Server actions are never called while rendering; the Radix dialog is replaced by plain wrappers so its content
// is part of the static markup.
vi.mock("@/app/student/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/components/ui/dialog", () => {
  const Wrap = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: Wrap, DialogContent: Wrap, DialogDescription: Wrap, DialogFooter: Wrap, DialogHeader: Wrap, DialogTitle: Wrap };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/student", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { TaskModal } from "@/app/student/_components/daily-tasks/task-modal";
import type { StudentTask } from "@/app/student/_components/daily-tasks/types";
import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import type { MaarifGrade } from "./maarif-grade";

const task = (over: Partial<StudentTask>): StudentTask =>
  ({
    id: "t1",
    task_date: "2026-10-06",
    task_type: "topic_study",
    title: "Görev",
    description: null,
    course_id: "maarif7-matematik",
    topic_id: null,
    resource_id: null,
    resource_names: [],
    total_count: null,
    correct_count: null,
    wrong_count: null,
    empty_count: null,
    start_page: null,
    end_page: null,
    duration_minutes: null,
    tracked_duration_minutes: 0,
    tracked_duration_seconds: 0,
    subject_scores: null,
    video_links: [],
    completed: false,
    analysis_pending: false,
    evidence_image_paths: [],
    evidence_review_status: "none",
    evidence_photo_status: {},
    status: "pending",
    reason: null,
    note: null,
    is_coach_assigned: true,
    order_index: 0,
    rejected_at: null,
    rejection_reason: null,
    week_locked: false,
    ...over,
  }) as StudentTask;

function render(t: StudentTask, opts: { grade: MaarifGrade | null; examType?: "YKS" | "LGS" }) {
  return renderToStaticMarkup(
    <MaarifGradeProvider value={opts.grade}>
      <TaskModal task={t} open onOpenChange={() => {}} onSaved={() => {}} examType={opts.examType ?? "YKS"} />
    </MaarifGradeProvider>,
  );
}

const CASES: [string, Partial<StudentTask>][] = [
  ["Soru Çözümü with a question target", { task_type: "question_bank", total_count: 40 }],
  ["Soru Çözümü, time target only", { task_type: "question_bank", total_count: null }],
  ["Branş Denemesi", { task_type: "branch_exam", total_count: 40 }],
  ["Genel Deneme", { task_type: "general_exam", title: "7. SINIF Genel Deneme" }],
  ["Konu Çalışması (single part)", { task_type: "topic_study", total_count: null }],
  ["Konu Çalışması with a question target", { task_type: "topic_study", total_count: 20 }],
  ["Video İzleme", { task_type: "video" }],
  ["Ekstra Çalışma", { task_type: "extra_custom" }],
  ["Kitap Okuma with a page target", { task_type: "reading", course_id: "kitap-okuma", total_count: 30 }],
  ["Kitap Okuma without a target", { task_type: "reading", course_id: "kitap-okuma", total_count: null }],
  ["a task whose photos are waiting for the coach", { task_type: "topic_study", evidence_image_paths: ["a/b/c.jpg"], evidence_review_status: "pending" }],
  ["a task the coach rejected the photo of", { task_type: "question_bank", total_count: 10, evidence_image_paths: ["a/b/c.jpg"], evidence_review_status: "rejected" }],
];

describe("the student's task modal: an explicit 'Yapılmadı' for every task type", () => {
  for (const [cohortName, opts] of [
    ["a 7th grader", { grade: 7 as MaarifGrade }],
    ["an LGS student", { grade: null, examType: "LGS" as const }],
  ] as const) {
    for (const [name, over] of CASES) {
      it(`${cohortName}, ${name}: the Yapılmadı button is there`, () => {
        const html = render(task(over), opts);
        expect(html).toContain("Yapılmadı</button>");
      });
    }
  }

  it("the photo (Kanıt Fotoğrafı) section is offered to a 7th grader and an LGS student, but not for Kitap Okuma", () => {
    expect(render(task({ task_type: "topic_study" }), { grade: 7 })).toContain("Kanıt");
    expect(render(task({ task_type: "topic_study" }), { grade: null, examType: "LGS" })).toContain("Kanıt");
    expect(render(task({ task_type: "reading", course_id: "kitap-okuma", total_count: 30 }), { grade: 7 })).not.toContain("Kanıt");
    expect(render(task({ task_type: "topic_study" }), { grade: 9 })).not.toContain("Kanıt");
  });
});

describe("the Soru Çözümü form: all three counts typed, nothing auto-filled", () => {
  const soru = task({ task_type: "question_bank", total_count: 100 });

  it("tells the student to fill all three boxes (0 for none) and that going over the target is fine", () => {
    for (const opts of [{ grade: 7 as MaarifGrade }, { grade: null, examType: "LGS" as const }, { grade: null }, { grade: 9 as MaarifGrade }]) {
      const html = render(soru, opts);
      expect(html).toContain("üçünü de doldur");
      expect(html).toContain("0 yaz");
      expect(html).toContain("Hedeften fazla soru çözebilirsin");
      expect(html).toContain("Yarım Yapıldı");
    }
  });

  it("the video-only 'Soruları çözmedim' box stays for the cohorts that had it, and off for LGS / 7th grade", () => {
    expect(render(soru, { grade: null })).toContain("Soruları çözmedim");
    expect(render(soru, { grade: 9 })).toContain("Soruları çözmedim");
    expect(render(soru, { grade: 7 })).not.toContain("Soruları çözmedim");
    expect(render(soru, { grade: null, examType: "LGS" })).not.toContain("Soruları çözmedim");
  });

  it("Branş Denemesi and Genel Deneme do not get this hint (their rules are unchanged)", () => {
    expect(render(task({ task_type: "branch_exam", total_count: 40 }), { grade: 7 })).not.toContain("Hedeften fazla soru çözebilirsin");
    expect(render(task({ task_type: "general_exam", title: "7. SINIF Genel Deneme" }), { grade: 7 })).not.toContain("Hedeften fazla soru çözebilirsin");
  });
});
