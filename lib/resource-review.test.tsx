import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/coach/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/app/student/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("@/components/ui/dialog", () => {
  const Wrap = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: Wrap, DialogContent: Wrap, DialogDescription: Wrap, DialogFooter: Wrap, DialogHeader: Wrap, DialogTitle: Wrap };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/student", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { defaultTaskFormValue, TASK_TYPE_OPTIONS, TaskFormFields } from "@/app/coach/students/[id]/_components/kanban/task-form-fields";
import { TaskModal } from "@/app/student/_components/daily-tasks/task-modal";
import { TASK_TYPE_LABELS, type StudentTask } from "@/app/student/_components/daily-tasks/types";
import { MaarifGradeProvider } from "@/components/maarif-grade-context";
import { applyCountChange, computeAutoTaskStatus } from "./count-fields";
import { taskWeight } from "./effort-weight";
import { lgsCompletionProblem } from "./lgs-completion";
import type { MaarifGrade } from "./maarif-grade";
import { checkQuestionBankSave, durationOnlyCountsRequired, QUESTION_CORRECT_REQUIRED } from "./question-bank-validation";
import { isSoruCozumuLike, RESOURCE_REVIEW_LABEL } from "./task-types";

const task = (over: Partial<StudentTask>): StudentTask =>
  ({
    id: "t1",
    task_date: "2026-10-06",
    task_type: "resource_review",
    title: "TYT Matematik — Temel Kavramlar",
    description: null,
    course_id: "tyt-matematik",
    topic_id: "tyt-matematik-u0-t0",
    resource_id: null,
    resource_names: [],
    total_count: 40,
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

const render = (t: StudentTask, grade: MaarifGrade | null = null, examType: "YKS" | "LGS" = "YKS") =>
  renderToStaticMarkup(
    <MaarifGradeProvider value={grade}>
      <TaskModal task={t} open onOpenChange={() => {}} onSaved={() => {}} examType={examType} />
    </MaarifGradeProvider>,
  );

describe("Kaynak Taraması is a Soru Çözümü in everything but its name", () => {
  it("is recognised as Soru Çözümü-like, and Soru Çözümü still is", () => {
    expect(isSoruCozumuLike("resource_review")).toBe(true);
    expect(isSoruCozumuLike("question_bank")).toBe(true);
    for (const other of ["branch_exam", "general_exam", "topic_study", "video", "reading", "extra_custom", "vocab_quiz", null, undefined]) {
      expect(isSoruCozumuLike(other), String(other)).toBe(false);
    }
  });

  it("has its label everywhere task types are named", () => {
    expect(RESOURCE_REVIEW_LABEL).toBe("Kaynak Taraması");
    expect(TASK_TYPE_LABELS.resource_review).toBe("Kaynak Taraması");
    expect(TASK_TYPE_OPTIONS).toContainEqual({ value: "resource_review", label: "Kaynak Taraması" });
    // listed right after Soru Çözümü
    const values = TASK_TYPE_OPTIONS.map((o) => o.value);
    expect(values.indexOf("resource_review")).toBe(values.indexOf("question_bank") + 1);
  });

  it("is weighted for completion like a Soru Çözümü (question count, else duration, else the default)", () => {
    for (const t of [{ total_count: 40 }, { duration_minutes: 45 }, {}]) {
      expect(taskWeight({ ...t, task_type: "resource_review", course_id: "tyt-matematik" })).toBe(taskWeight({ ...t, task_type: "question_bank", course_id: "tyt-matematik" }));
    }
  });
});

describe("the student's modal for a Kaynak Taraması", () => {
  it("shows the same Toplam / Doğru / Yanlış / Boş boxes as a Soru Çözümü", () => {
    const html = render(task({}));
    const soru = render(task({ task_type: "question_bank" }));
    for (const label of ["Toplam", "Doğru", "Yanlış", "Boş"]) {
      expect(html).toContain(">" + label + "<");
      expect(soru).toContain(">" + label + "<");
    }
    expect((html.match(/<input/g) ?? []).length).toBe((soru.match(/<input/g) ?? []).length);
  });

  it("has the Yapılmadı button, the video-only box where Soru Çözümü has it, and nothing for LGS / 7th grade", () => {
    expect(render(task({}))).toContain("Yapılmadı</button>");
    expect(render(task({}))).toContain("Soruları çözmedim");
    expect(render(task({}), 7)).not.toContain("Soruları çözmedim");
    expect(render(task({}), null, "LGS")).not.toContain("Soruları çözmedim");
  });

  it("asks an LGS or 7th grader for the Kanıt Fotoğrafı like any task but Kitap Okuma", () => {
    expect(render(task({}), 7)).toContain("Kanıt");
    expect(render(task({}), null, "LGS")).toContain("Kanıt");
    expect(render(task({}), 9)).not.toContain("Kanıt");
  });

  it("also for a time-only target", () => {
    const html = render(task({ total_count: null, duration_minutes: 45 }));
    expect(html).toContain("Doğru");
    expect(html).toContain("Yapılmadı</button>");
  });
});

describe("the validation rules of Soru Çözümü apply to it", () => {
  it("Doğru must be typed, blank Yanlış / Boş are 0, and the Matematik / Geometri time-only rule holds", () => {
    // the shared rules (the modal and the server both call them for every Soru Çözümü-like task)
    expect(checkQuestionBankSave({ correct: null, wrong: 3, empty: null, noQuestionsSolved: false, watchedVideo: false, isLgs: false })).toBe(QUESTION_CORRECT_REQUIRED);
    expect(checkQuestionBankSave({ correct: 30, wrong: null, empty: null, noQuestionsSolved: false, watchedVideo: false, isLgs: false })).toBeNull();
    expect(durationOnlyCountsRequired({ courseId: "tyt-matematik", status: "done" })).toBe(true);
    expect(durationOnlyCountsRequired({ courseId: "tyt-geometri", status: "half_done" })).toBe(true);
    expect(durationOnlyCountsRequired({ courseId: "tyt-fizik", status: "done" })).toBe(false);
    expect(durationOnlyCountsRequired({ courseId: "tyt-matematik", status: "not_done" })).toBe(false);
  });

  it("nothing fills Boş in for the student, and the 5-question tolerance decides Yarım / Yapıldı", () => {
    const own = { taskType: "resource_review", isCoachAssigned: true };
    const s = applyCountChange(own, applyCountChange(own, { total: "100", correct: "", wrong: "", empty: "" }, "correct", "50"), "wrong", "10");
    expect(s).toEqual({ total: "100", correct: "50", wrong: "10", empty: "" });
    expect(computeAutoTaskStatus(100, 50, 10, 0)).toBe("half_done");
    expect(computeAutoTaskStatus(100, 90, 5, 0)).toBe("done");
    expect(computeAutoTaskStatus(100, 80, 30, 0)).toBe("done"); // more than the target is fine
  });

  it("an LGS / 7th grader needs the photo and all three counts before it can be completed", () => {
    const base = { taskType: "resource_review", title: "x", photoCount: 0, correct: null, wrong: null, empty: null, subjectScores: null };
    expect(lgsCompletionProblem(base)).toContain("kanıt fotoğrafı");
    expect(lgsCompletionProblem({ ...base, photoCount: 1 })).toContain("doğru, yanlış ve boş");
    expect(lgsCompletionProblem({ ...base, photoCount: 1, correct: 20, wrong: 3, empty: 0 })).toBeNull();
  });
});

describe("the coach's form for a Kaynak Taraması", () => {
  const form = (taskType: "resource_review" | "question_bank") =>
    renderToStaticMarkup(<TaskFormFields value={{ ...defaultTaskFormValue("YKS"), taskType, courseId: "tyt-matematik" }} onChange={() => {}} courseResourceData={{}} />);

  it("asks for the same fields as a Soru Çözümü: Ders, Konu, Kaynaklar, a question and a time target", () => {
    const html = form("resource_review");
    for (const text of ["Ders", "Konu", "Kaynaklar (opsiyonel)"]) expect(html).toContain(text);
    for (const text of ["Soru Sayısı / Hedef", "Hedef Süre (dk)"]) expect(html).toContain(text);
    // the same fields in the same order: identical but for the Görev Türü selector itself
    const withoutTypeSelect = (h: string) => h.replace(/<select id="task-form-type".*?<\/select>/, "");
    expect(withoutTypeSelect(html)).toBe(withoutTypeSelect(form("question_bank")));
  });
});
