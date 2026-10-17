import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/student/ingilizce-quiz/actions", () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : vi.fn()) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/student/_components/focus-timer/focus-timer-trigger", () => ({ FocusTimerTrigger: () => null }));

import { TaskCard } from "@/app/student/_components/daily-tasks/task-card";
import type { StudentTask } from "@/app/student/_components/daily-tasks/types";

const task = (over: Partial<StudentTask>): StudentTask =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    task_date: "2026-10-14",
    task_type: "vocab_quiz",
    title: "3. Ünite - 30 Kelime",
    description: null,
    course_id: "ingilizce-quiz",
    topic_id: "3",
    resource_id: null,
    resource_names: [],
    total_count: 30,
    correct_count: 12,
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
    status: "half_done",
    reason: null,
    note: null,
    is_coach_assigned: true,
    order_index: 0,
    rejected_at: null,
    rejection_reason: null,
    week_locked: false,
    ...over,
  }) as StudentTask;

const render = (t: StudentTask) => renderToStaticMarkup(<TaskCard task={t} onClick={() => {}} />);

describe("İngilizce Kelime Quizi card", () => {
  it("shows 'Quize Başla' (a link into THIS task's quiz) next to 'Yapılmadı'", () => {
    const html = render(task({}));
    expect(html).toContain("Quize Başla");
    expect(html).toContain("Yapılmadı");
    expect(html).toContain('href="/student/ingilizce-quiz?unit=3&amp;task=11111111-1111-4111-8111-111111111111"');
  });

  it("offers no 'Yapıldı' or 'Yarım' choice -- the quiz sets those", () => {
    const html = render(task({ status: "pending", correct_count: null }));
    expect(html).not.toMatch(/>Yapıldı</);
    expect(html).not.toMatch(/>Yarım Yapıldı</);
    expect(html).not.toMatch(/>Tamamlandı</);
  });

  it("reads its progress and status off the card", () => {
    expect(render(task({}))).toContain("12/30 kelime · Yarım Yapıldı");
    expect(render(task({ status: "not_done" }))).toContain("12/30 kelime · Yapılmadı");
  });

  it("'Yapılmadı' shows as chosen once it is", () => {
    const html = render(task({ status: "not_done" }));
    expect(html).toMatch(/aria-pressed="true"[^>]*>Yapılmadı/);
    expect(render(task({ status: "pending" }))).toMatch(/aria-pressed="false"[^>]*>Yapılmadı/);
  });

  it("a finished task has no buttons left", () => {
    const html = render(task({ status: "done", completed: true, correct_count: 30 }));
    expect(html).not.toContain("Quize Başla");
    expect(html).not.toMatch(/>Yapılmadı</);
    expect(html).toContain("30/30 kelime · Yapıldı");
  });

  it("a locked week is read-only: no buttons", () => {
    expect(render(task({ week_locked: true }))).not.toContain("Quize Başla");
  });

  it("other task types are untouched", () => {
    const html = render(task({ task_type: "question_bank", title: "Soru", course_id: "lgs-matematik", topic_id: null }));
    expect(html).not.toContain("Quize Başla");
  });
});
