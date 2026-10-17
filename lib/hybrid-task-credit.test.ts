import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  STUDY_HALF_CREDIT,
  effectiveStudyStatus,
  isStudyTask,
  studyTaskParts,
  taskCredit,
  taskCreditFraction,
  taskWeight,
  weightedCounts,
  type WeightableTask,
} from "./effort-weight";
import { resetStudyStatusProbe, studyStatusColumnAvailable, studyStatusSelect } from "./task-study-status";
import { completionPercent } from "./completion";

// A Konu Çalışması / Video task is two tasks in one: a study / video part (time target) and a question part (question target). Each has its
// own weight, and each earns its own credit: the study part from the student's own pick, the question part from the questions solved.
// Math: 20 units per question; 5 units per minute -> 40 questions = 800, 60 minutes = 300. Verbal: 10 per question, 15 per minute.

const hybrid = (status: string, over: Partial<WeightableTask> = {}): WeightableTask => ({
  task_date: "2026-10-10",
  task_type: "topic_study",
  course_id: "tyt-matematik",
  title: "x",
  status,
  total_count: 40, // 800 units of question work
  duration_minutes: 60, // 300 units of study work
  ...over,
});

describe("weight: the study part and the question part are summed, never one overwriting the other", () => {
  it("a task with both a time and a question target weighs both", () => {
    expect(studyTaskParts({ course_id: "tyt-matematik", total_count: 40, duration_minutes: 60 })).toEqual({ study: 300, questions: 800 });
    expect(taskWeight(hybrid("pending"))).toBe(1100);
    // verbal subject: 15 units a minute, 10 a question -- the old rule would have let the 450 minutes-weight win over the 400
    expect(taskWeight({ task_type: "topic_study", course_id: "tyt-tarih", total_count: 40, duration_minutes: 30 })).toBe(450 + 400);
    // the legacy "video" type is the same task
    expect(taskWeight({ task_type: "video", course_id: "tyt-matematik", total_count: 10, duration_minutes: 60 })).toBe(300 + 200);
  });

  it("a task with only one of them weighs that one; with neither it is the 30-minute default (as before)", () => {
    expect(taskWeight({ task_type: "topic_study", course_id: "tyt-tarih", total_count: 40 })).toBe(400); // a bare question target
    expect(taskWeight({ task_type: "topic_study", course_id: "tyt-matematik", duration_minutes: 60 })).toBe(300);
    expect(taskWeight({ task_type: "topic_study", course_id: "tyt-matematik" })).toBe(150);
    expect(taskWeight({ task_type: "video", course_id: "tyt-matematik", duration_minutes: 0, total_count: 0 })).toBe(150);
  });

  it("Soru Çözümü and Kaynak Taraması are ONE activity: their time is only the pace for the same questions, so they are not summed", () => {
    expect(taskWeight({ task_type: "question_bank", course_id: "tyt-matematik", total_count: 40, duration_minutes: 60 })).toBe(800);
    expect(taskWeight({ task_type: "resource_review", course_id: "tyt-matematik", total_count: 40, duration_minutes: 60 })).toBe(1200);
    expect(isStudyTask({ task_type: "question_bank" })).toBe(false);
    expect(isStudyTask({ task_type: "topic_study" })).toBe(true);
    expect(isStudyTask({ task_type: "video" })).toBe(true);
  });
});

describe("credit: each part earns on its own", () => {
  it("study done + every question solved: the whole task", () => {
    const t = hybrid("done", { study_status: "done", correct_count: 30, wrong_count: 6, empty_count: 4 });
    expect(taskCredit(t)).toBe(1100);
    expect(taskCreditFraction(t)).toBe(1);
  });

  it("the 5-question tolerance gives the whole question part (35 / 40, or 45 / 40)", () => {
    expect(taskCredit(hybrid("done", { study_status: "done", correct_count: 35 }))).toBe(1100);
    expect(taskCredit(hybrid("done", { study_status: "done", correct_count: 45 }))).toBe(1100);
    // 34 / 40 is outside it: proportional
    expect(taskCredit(hybrid("half_done", { study_status: "done", correct_count: 34 }))).toBe(300 + 800 * (34 / 40));
  });

  it("CLICKING DONE ON THE STUDY PART WITHOUT ENTERING ANY QUESTION COUNT earns the study part only", () => {
    // the overall status merges to half_done (study done + nothing solved), exactly what the server stores
    const t = hybrid("half_done", { study_status: "done" });
    expect(taskCredit(t)).toBe(300);
    expect(completionPercent({ done: taskCredit(t), total: taskWeight(t) })).toBe(27);
  });

  it("solving every question without the video earns the question part only", () => {
    // study not done + all solved: the merge of the two is half_done (done + not done lands on half), the questions were solved
    expect(taskCredit(hybrid("half_done", { study_status: "not_done", correct_count: 40 }))).toBe(800);
  });

  it("study half done earns half of the study part; the question part is the share solved", () => {
    const t = hybrid("half_done", { study_status: "half_done", correct_count: 15, wrong_count: 8, empty_count: 2 });
    expect(STUDY_HALF_CREDIT).toBe(0.5);
    expect(taskCredit(t)).toBe(300 * 0.5 + 800 * (25 / 40));
  });

  it("study done + 25 / 40 solved: the full study part and 62.5% of the question part", () => {
    expect(taskCredit(hybrid("half_done", { study_status: "done", correct_count: 25 }))).toBe(300 + 500);
  });

  it("study not done but some questions solved: the questions still count", () => {
    expect(taskCredit(hybrid("not_done", { study_status: "not_done", correct_count: 30 }))).toBe(600);
  });

  it("a pending task (or one held for approval) has earned nothing, whatever was typed", () => {
    expect(taskCredit(hybrid("pending", { study_status: "done", correct_count: 40 }))).toBe(0);
  });

  it("a task with only a question target: Done without counts earns nothing (the study part has no weight); with counts it earns by them", () => {
    const bare = { task_type: "topic_study", course_id: "tyt-tarih", total_count: 40, task_date: "2026-10-10" } as const;
    expect(taskCredit({ ...bare, status: "half_done", study_status: "done" })).toBe(0);
    expect(taskCredit({ ...bare, status: "half_done", study_status: "done", correct_count: 20 })).toBe(200);
  });

  it("a video-only task (no question target): done earns all, half done half, not done nothing", () => {
    const video = { task_type: "topic_study", course_id: "tyt-matematik", duration_minutes: 60, task_date: "2026-10-10" } as const;
    expect(taskCredit({ ...video, status: "done" })).toBe(300);
    expect(taskCredit({ ...video, status: "half_done" })).toBe(150);
    expect(taskCredit({ ...video, status: "not_done" })).toBe(0);
  });

  it("the single-activity types keep their rule: done = everything, half done = solved / target", () => {
    const qb = { task_type: "question_bank", course_id: "tyt-matematik", total_count: 40, duration_minutes: 60, task_date: "2026-10-10" } as const;
    expect(taskCredit({ ...qb, status: "done" })).toBe(800);
    expect(taskCredit({ ...qb, status: "half_done", correct_count: 20 })).toBe(400);
  });

  it("summed over a set of tasks, with every task's full weight below", () => {
    const tasks = [hybrid("half_done", { study_status: "done" }), hybrid("done", { study_status: "done", correct_count: 40 })];
    expect(weightedCounts(tasks)).toEqual({ done: 300 + 1100, total: 2200 });
  });
});

describe("the study part's own pick: kept, and read safely", () => {
  it("uses the stored pick while the overall status is still what it merges to", () => {
    // study done, nothing solved -> overall half_done: consistent, the pick stands
    expect(effectiveStudyStatus(hybrid("half_done", { study_status: "done" }))).toBe("done");
    // study done, 25 / 40 -> half_done; study half, all solved -> half_done
    expect(effectiveStudyStatus(hybrid("half_done", { study_status: "done", correct_count: 25 }))).toBe("done");
    expect(effectiveStudyStatus(hybrid("half_done", { study_status: "half_done", correct_count: 40 }))).toBe("half_done");
  });

  it("a status changed by hand afterwards (the coach) overrides a pick that no longer fits", () => {
    expect(effectiveStudyStatus(hybrid("done", { study_status: "half_done" }))).toBe("done");
    expect(effectiveStudyStatus(hybrid("not_done", { study_status: "done", correct_count: 40 }))).toBe("not_done");
  });

  it("an older row (no pick) reads its overall status as the pick; pending reads as no pick", () => {
    expect(effectiveStudyStatus(hybrid("done"))).toBe("done");
    expect(effectiveStudyStatus(hybrid("half_done"))).toBe("half_done");
    expect(effectiveStudyStatus(hybrid("pending", { study_status: "done" }))).toBeNull();
  });
});

describe("the column is probed once and left out of every query until migration 0138 exists", () => {
  const client = (error: unknown) => {
    const limit = vi.fn().mockResolvedValue({ data: [], error });
    const select = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ select }));
    return { from, select, limit };
  };

  it("column missing: the select list gets nothing appended; present: ', study_status'", async () => {
    resetStudyStatusProbe();
    const missing = client({ message: 'column "study_status" does not exist' });
    expect(await studyStatusSelect(missing as never)).toBe("");
    resetStudyStatusProbe();
    const present = client(null);
    expect(await studyStatusSelect(present as never)).toBe(", study_status");
    expect(present.select).toHaveBeenCalledWith("study_status");
  });

  it("is checked once, not on every query; a miss is re-checked later, a hit is kept", async () => {
    resetStudyStatusProbe();
    const present = client(null);
    expect(await studyStatusColumnAvailable(present as never)).toBe(true);
    expect(await studyStatusColumnAvailable(present as never)).toBe(true);
    expect(present.from).toHaveBeenCalledTimes(1);
    resetStudyStatusProbe();
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

  it("migration 0138 adds the nullable, constrained, idempotent column", () => {
    const sql = read("../supabase/migrations/0138_task_study_status.sql");
    expect(sql).toContain("add column if not exists study_status text");
    expect(sql).toContain("study_status in ('done', 'half_done', 'not_done')");
    expect(sql).toContain("notify pgrst, 'reload schema';");
    expect(sql).not.toMatch(/drop column(?! study_status)/);
  });

  it("every query behind a percentage reads the pick (when the column exists)", () => {
    for (const file of [
      "../app/coach/students/page.tsx",
      "../app/coach/students/[id]/page.tsx",
      "../app/parent/page.tsx",
      "../app/parent/program/page.tsx",
      "../app/student/page.tsx",
      "../app/coach/notifications/page.tsx",
      "../app/admin/coaches/[id]/page.tsx",
      "./karne-summary-data.ts",
      "./coach-dashboard-activity.ts",
    ]) {
      expect(read(file), file).toContain("studyStatusSelect(");
    }
  });

  it("the student's save keeps the pick of a dual task, and the modal re-opens on it", () => {
    const actions = read("../app/student/actions.ts");
    expect(actions).toContain("{ study_status: dualManualStatus }");
    expect(actions).toContain("studyStatusColumnAvailable(supabase)");
    const modal = read("../app/student/_components/daily-tasks/task-modal.tsx");
    expect(modal).toContain("effectiveStudyStatus(task)");
  });
});
