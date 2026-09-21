import { beforeEach, describe, expect, it, vi } from "vitest";

// Kanıt Fotoğrafı approval flow against a mocked Supabase client: a photo-backed
// completion is HELD for the coach (student side), and Onayla / Reddet act on it
// (coach side). The trigger that backs this up in the database (0088) is covered
// by that migration's own verification query.

type Row = Record<string, unknown>;

const USER = "u1";
const TASK = "11111111-1111-4111-8111-111111111111";

const state: { task: Row; updates: { table: string; payload: Row }[] } = { task: {}, updates: [] };

function baseTask(overrides: Row = {}): Row {
  return {
    id: TASK,
    student_id: USER,
    task_date: "2026-09-22",
    course_id: null,
    topic_id: null,
    task_type: "question_bank",
    title: "Soru Çözümü",
    status: "pending",
    is_coach_assigned: true,
    is_approved_by_coach: true,
    evidence_image_paths: [`${USER}/${TASK}/a.jpg`, `${USER}/${TASK}/b.jpg`],
    evidence_review_status: "none",
    evidence_pending_status: null,
    total_count: 20,
    correct_count: null,
    wrong_count: null,
    empty_count: null,
    ...overrides,
  };
}

function builder(table: string) {
  let op: "select" | "update" = "select";
  let payload: Row = {};
  const rows = (single: boolean) => {
    if (table === "coach_students") return { data: { student_id: USER }, error: null };
    if (table === "student_tasks") {
      const row = op === "update" ? { ...state.task, ...payload } : state.task;
      return { data: single ? row : [row], error: null };
    }
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "gte", "lte", "order", "limit", "upsert"]) b[m] = () => b;
  b.update = (p: Row) => {
    op = "update";
    payload = p;
    state.updates.push({ table, payload: p });
    return b;
  };
  b.single = () => Promise.resolve(rows(true));
  b.maybeSingle = () => Promise.resolve(rows(true));
  b.then = (resolve: (v: unknown) => unknown) => resolve(rows(false));
  return b;
}

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
  from: (table: string) => builder(table),
  rpc: () => {
    const p = Promise.resolve({ data: {}, error: null });
    return Object.assign(p, { single: () => p });
  },
  storage: { from: () => ({ remove: async () => ({ error: null }) }) },
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { updateTaskProgress } from "../app/student/actions";
import { approveStudentTask, rejectStudentTask } from "../app/coach/actions";

function taskUpdate(): Row {
  return state.updates.find((u) => u.table === "student_tasks")!.payload;
}

beforeEach(() => {
  state.task = baseTask();
  state.updates = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("student completes a task", () => {
  it("HOLDS a photo-backed completion for the coach instead of marking it done", async () => {
    await updateTaskProgress(TASK, { status: "done", completed: true });
    expect(taskUpdate()).toMatchObject({
      status: "pending",
      completed: false,
      evidence_review_status: "pending",
      evidence_pending_status: "done",
    });
  });

  it("remembers a half-done claim too", async () => {
    await updateTaskProgress(TASK, { status: "half_done" });
    expect(taskUpdate()).toMatchObject({ status: "pending", evidence_review_status: "pending", evidence_pending_status: "half_done" });
  });

  it("holds a completion that comes from counting (Doğru/Yanlış/Boş reaching the target)", async () => {
    await updateTaskProgress(TASK, { correct_count: 18, wrong_count: 2, empty_count: 0 });
    expect(taskUpdate()).toMatchObject({ status: "pending", evidence_review_status: "pending", evidence_pending_status: "done" });
  });

  it("completes normally without photos", async () => {
    state.task = baseTask({ evidence_image_paths: [] });
    await updateTaskProgress(TASK, { status: "done", completed: true });
    expect(taskUpdate()).toMatchObject({ status: "done", completed: true });
    expect(taskUpdate()).not.toHaveProperty("evidence_review_status");
  });

  it("does not ask twice once the coach approved the photos", async () => {
    state.task = baseTask({ evidence_review_status: "approved" });
    await updateTaskProgress(TASK, { status: "done", completed: true });
    expect(taskUpdate()).toMatchObject({ status: "done" });
    expect(taskUpdate()).not.toHaveProperty("evidence_review_status");
  });

  it("leaves an unapproved self-created task to the existing extra-task approval", async () => {
    state.task = baseTask({ is_coach_assigned: false, is_approved_by_coach: false });
    await updateTaskProgress(TASK, { status: "done", completed: true });
    expect(taskUpdate()).toMatchObject({ status: "done" });
    expect(taskUpdate()).not.toHaveProperty("evidence_review_status");
  });

  it("does not hold a not-done mark", async () => {
    await updateTaskProgress(TASK, { status: "not_done" });
    expect(taskUpdate()).toMatchObject({ status: "not_done" });
  });
});

describe("coach approves / rejects a held task", () => {
  beforeEach(() => {
    state.task = baseTask({ evidence_review_status: "pending", evidence_pending_status: "half_done" });
  });

  it("Onayla applies the status the student reported", async () => {
    const result = await approveStudentTask(TASK);
    expect(result.success).toBe(true);
    expect(taskUpdate()).toMatchObject({ evidence_review_status: "approved", status: "half_done", completed: false });
  });

  it("Onayla completes a task the student reported as done", async () => {
    state.task = baseTask({ evidence_review_status: "pending", evidence_pending_status: "done" });
    await approveStudentTask(TASK);
    expect(taskUpdate()).toMatchObject({ evidence_review_status: "approved", status: "done", completed: true });
  });

  it("Reddet sends it back as not completed but keeps the task and its photos", async () => {
    const result = await rejectStudentTask(TASK);
    expect(result.success).toBe(true);
    const update = taskUpdate();
    expect(update).toMatchObject({ evidence_review_status: "rejected", status: "pending", completed: false });
    expect(update).not.toHaveProperty("evidence_image_paths");
    expect(update).not.toHaveProperty("rejected_at");
  });

  it("does nothing on a coach-assigned task that is not awaiting review", async () => {
    state.task = baseTask({ evidence_review_status: "none" });
    expect(await approveStudentTask(TASK)).toEqual({ success: false, code: "ALREADY_PROCESSED" });
    expect(await rejectStudentTask(TASK)).toEqual({ success: false, code: "ALREADY_PROCESSED" });
    expect(state.updates).toHaveLength(0);
  });
});
