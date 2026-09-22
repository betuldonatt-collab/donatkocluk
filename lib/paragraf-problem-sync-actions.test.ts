import { beforeEach, describe, expect, it, vi } from "vitest";

// Paragraf ve Problem Çizelgesi auto-sync (migration 0091, +0092 for LGS's
// Paragraf/Kitap Okuma) against a mocked Supabase client: completing (or
// editing, or approving) a "paragraf"/"problem"/"kitap-okuma" routine task
// calls the matching sync RPC for that task; anything else never does. Both
// RPCs' own recompute logic (including the exam_type gate that keeps a YKS
// "paragraf" task out of the LGS tracker and vice versa) is covered by each
// migration's own verification query and by lib/paragraf-problem-chart.test.ts
// (the chart-side aggregation sync_paragraf_problem_entry feeds).

type Row = Record<string, unknown>;

const USER = "u1";
const TASK = "11111111-1111-4111-8111-111111111111";
const STUDENT = "22222222-2222-4222-8222-222222222222";

const state: { task: Row; rpcCalls: { fn: string; args: unknown }[] } = { task: {}, rpcCalls: [] };

function baseTask(overrides: Row = {}): Row {
  return {
    id: TASK,
    student_id: USER,
    task_date: "2026-09-22",
    course_id: "paragraf",
    topic_id: null,
    task_type: "question_bank",
    title: "Paragraf",
    status: "pending",
    is_coach_assigned: true,
    is_approved_by_coach: true,
    evidence_image_paths: [],
    evidence_review_status: "none",
    evidence_photo_status: {},
    total_count: 20,
    correct_count: null,
    wrong_count: null,
    empty_count: null,
    duration_minutes: null,
    ...overrides,
  };
}

function builder(table: string) {
  let op: "select" | "update" = "select";
  let payload: Row = {};
  const row = () => {
    if (table === "coach_students") return { student_id: STUDENT };
    if (table !== "student_tasks") return null;
    return op === "update" ? { ...state.task, ...payload } : state.task;
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = () => b;
  b.update = (p: Row) => {
    op = "update";
    payload = p;
    return b;
  };
  b.single = () => Promise.resolve({ data: row(), error: null });
  b.maybeSingle = () => Promise.resolve({ data: row(), error: null });
  // No terminal call (e.g. approveStudentTask's plain .select("*")) -- real
  // supabase-js resolves an array here, not the bare row .single() gives.
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [row()].filter((r) => r !== null), error: null });
  return b;
}

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
  from: (table: string) => builder(table),
  rpc: (fn: string, args: unknown) => {
    state.rpcCalls.push({ fn, args });
    const p = Promise.resolve({ data: {}, error: null });
    return Object.assign(p, { single: () => p });
  },
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { updateTaskProgress } from "../app/student/actions";
import { approveStudentTask, updateAssignedTaskStatus } from "../app/coach/actions";

function syncCalls() {
  return state.rpcCalls.filter((c) => c.fn === "sync_paragraf_problem_entry");
}
function lgsSyncCalls() {
  return state.rpcCalls.filter((c) => c.fn === "sync_lgs_daily_routine_entry");
}

beforeEach(() => {
  state.task = baseTask();
  state.rpcCalls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("student marks a Paragraf/Problem routine task's counts (updateTaskProgress)", () => {
  it("syncs the chart entry when the counts change", async () => {
    await updateTaskProgress(TASK, { correct_count: 15, wrong_count: 3, empty_count: 2 });
    expect(syncCalls()).toEqual([{ fn: "sync_paragraf_problem_entry", args: { p_task_id: TASK } }]);
  });

  it("does not sync a non-Paragraf/Problem task", async () => {
    state.task = baseTask({ course_id: "tyt-matematik" });
    await updateTaskProgress(TASK, { correct_count: 15, wrong_count: 3, empty_count: 2 });
    expect(syncCalls()).toHaveLength(0);
  });

  it("does not sync a save that touches neither counts nor status", async () => {
    await updateTaskProgress(TASK, { duration_minutes: 45 });
    expect(syncCalls()).toHaveLength(0);
  });

  it("syncs a plain status change (e.g. Hızlı İşaretleme) even without touching counts", async () => {
    state.task = baseTask({ status: "done", total_count: null, correct_count: 10, wrong_count: 0, empty_count: 0 });
    await updateTaskProgress(TASK, { status: "not_done" });
    expect(syncCalls()).toHaveLength(1);
  });

  it("a 'paragraf' task (shared by both cohorts) syncs BOTH trackers -- each RPC's own exam_type gate decides which one actually writes", async () => {
    await updateTaskProgress(TASK, { correct_count: 15, wrong_count: 3, empty_count: 2 });
    expect(syncCalls()).toHaveLength(1);
    expect(lgsSyncCalls()).toEqual([{ fn: "sync_lgs_daily_routine_entry", args: { p_task_id: TASK } }]);
  });

  it("a Kitap Okuma (reading) task syncs only the LGS tracker, never the YKS one", async () => {
    state.task = baseTask({ course_id: "kitap-okuma", task_type: "reading", title: "Sefiller", correct_count: 15, wrong_count: null, empty_count: null });
    await updateTaskProgress(TASK, { correct_count: 20 });
    expect(syncCalls()).toHaveLength(0);
    expect(lgsSyncCalls()).toEqual([{ fn: "sync_lgs_daily_routine_entry", args: { p_task_id: TASK } }]);
  });

  it("does not sync either tracker for a plain course", async () => {
    state.task = baseTask({ course_id: "tyt-matematik" });
    await updateTaskProgress(TASK, { correct_count: 15, wrong_count: 3, empty_count: 2 });
    expect(lgsSyncCalls()).toHaveLength(0);
  });
});

describe("coach actions on a Paragraf/Problem routine task", () => {
  it("updateAssignedTaskStatus syncs it", async () => {
    await updateAssignedTaskStatus(STUDENT, TASK, "done");
    expect(syncCalls()).toEqual([{ fn: "sync_paragraf_problem_entry", args: { p_task_id: TASK } }]);
  });

  it("updateAssignedTaskStatus does not sync a different course", async () => {
    state.task = baseTask({ course_id: "tyt-fizik" });
    await updateAssignedTaskStatus(STUDENT, TASK, "done");
    expect(syncCalls()).toHaveLength(0);
  });

  it("approveStudentTask syncs a self-created Paragraf task once approved", async () => {
    state.task = baseTask({ is_coach_assigned: false, is_approved_by_coach: false, status: "done", correct_count: 10, wrong_count: 0, empty_count: 0 });
    const result = await approveStudentTask(TASK);
    expect(result.success).toBe(true);
    expect(syncCalls()).toEqual([{ fn: "sync_paragraf_problem_entry", args: { p_task_id: TASK } }]);
  });

  it("updateAssignedTaskStatus on a Kitap Okuma task syncs only the LGS tracker", async () => {
    state.task = baseTask({ course_id: "kitap-okuma", task_type: "reading" });
    await updateAssignedTaskStatus(STUDENT, TASK, "done");
    expect(syncCalls()).toHaveLength(0);
    expect(lgsSyncCalls()).toEqual([{ fn: "sync_lgs_daily_routine_entry", args: { p_task_id: TASK } }]);
  });
});
