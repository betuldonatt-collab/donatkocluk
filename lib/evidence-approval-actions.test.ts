import { beforeEach, describe, expect, it, vi } from "vitest";

// Kanıt Fotoğrafı approval flow against a mocked Supabase client: a photo-backed
// completion is HELD for the coach (student side), and Onayla / Reddet act on it
// (coach side). The trigger that backs this up in the database (0088) is covered
// by that migration's own verification query.

type Row = Record<string, unknown>;

const USER = "u1";
const TASK = "11111111-1111-4111-8111-111111111111";

const state: {
  task: Row;
  updates: { table: string; payload: Row }[];
  uploadError: unknown;
  removed: string[][];
  updateError: unknown;
  rpcError: unknown;
} = { task: {}, updates: [], uploadError: null, removed: [], updateError: null, rpcError: null };

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
    evidence_photo_status: {},
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
      if (op === "update" && state.updateError) return { data: null, error: state.updateError };
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
    const p = Promise.resolve({ data: state.rpcError ? null : {}, error: state.rpcError });
    return Object.assign(p, { single: () => p });
  },
  storage: {
    from: () => ({
      upload: async () => ({ data: null, error: state.uploadError }),
      remove: async (paths: string[]) => {
        state.removed.push(paths);
        return { error: null };
      },
    }),
  },
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { removeTaskEvidence, updateTaskProgress, uploadTaskEvidence } from "../app/student/actions";
import { approveStudentTask, rejectStudentTask, reviewEvidencePhotos } from "../app/coach/actions";

function taskUpdate(): Row {
  return state.updates.find((u) => u.table === "student_tasks")!.payload;
}

beforeEach(() => {
  state.task = baseTask();
  state.updates = [];
  state.uploadError = null;
  state.removed = [];
  state.updateError = null;
  state.rpcError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function photoForm(): FormData {
  const form = new FormData();
  form.set("taskId", TASK);
  form.set("file", new File([new Uint8Array(1000)], "kanit.jpg", { type: "image/jpeg" }));
  return form;
}

describe("uploadTaskEvidence", () => {
  it("adds the photo to the task's list without holding a task that is not completed", async () => {
    state.task = baseTask({ evidence_image_paths: [], status: "pending" });
    const result = await uploadTaskEvidence(photoForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toMatch(new RegExp(`^${USER}/${TASK}/[0-9a-f-]+\\.jpg$`));
    expect(taskUpdate()).toMatchObject({ evidence_image_paths: result.paths });
    expect(taskUpdate()).not.toHaveProperty("evidence_review_status");
  });

  it("has no photo limit", async () => {
    state.task = baseTask({ evidence_image_paths: Array.from({ length: 12 }, (_, i) => `${USER}/${TASK}/${i}.jpg`), status: "pending" });
    const result = await uploadTaskEvidence(photoForm());
    expect(result.ok && result.paths).toHaveLength(13);
  });

  it("sends a task that is already done back for review when a photo is added", async () => {
    state.task = baseTask({ evidence_image_paths: [], status: "done" });
    const result = await uploadTaskEvidence(photoForm());
    expect(result).toMatchObject({ ok: true, reviewStatus: "pending", status: "pending" });
    expect(taskUpdate()).toMatchObject({ status: "pending", evidence_review_status: "pending", evidence_pending_status: "done" });
  });

  it("still succeeds when the stats rollup afterwards fails", async () => {
    state.task = baseTask({ evidence_image_paths: [], status: "done" });
    state.rpcError = { code: "XX000", message: "rollup broke" };
    const result = await uploadTaskEvidence(photoForm());
    expect(result.ok).toBe(true);
  });

  it("names the Storage step (with code and message) when the upload is refused", async () => {
    state.uploadError = { statusCode: "403", message: "new row violates row-level security policy" };
    const result = await uploadTaskEvidence(photoForm());
    expect(result).toEqual({
      ok: false,
      error: "Fotoğraf depolamaya yüklenemedi.",
      detail: "upload · 403 · new row violates row-level security policy",
    });
    expect(state.updates).toHaveLength(0);
  });

  it("names the record step and deletes the orphaned file when saving the path fails", async () => {
    state.task = baseTask({ evidence_image_paths: [], status: "pending" });
    state.updateError = { code: "P0001", message: "A task with evidence photos needs the coach's approval" };
    const result = await uploadTaskEvidence(photoForm());
    expect(result).toMatchObject({ ok: false, error: "Fotoğraf yüklendi ama göreve kaydedilemedi." });
    expect(!result.ok && result.detail).toContain("record · P0001");
    expect(state.removed).toHaveLength(1);
  });

  it("rejects a non-image file before touching Storage", async () => {
    const form = new FormData();
    form.set("taskId", TASK);
    form.set("file", new File(["x"], "a.pdf", { type: "application/pdf" }));
    const result = await uploadTaskEvidence(form);
    expect(result.ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });
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

const A = `${USER}/${TASK}/a.jpg`;
const B = `${USER}/${TASK}/b.jpg`;

describe("per-photo review by the coach", () => {
  beforeEach(() => {
    state.task = baseTask({ evidence_review_status: "pending", evidence_pending_status: "done" });
  });

  it("rejecting ONE photo sends the whole task back, keeping the other verdict", async () => {
    const result = await reviewEvidencePhotos(TASK, [
      { path: A, decision: "approved" },
      { path: B, decision: "rejected" },
    ]);
    expect(result).toEqual({ success: true, outcome: "rejected" });
    expect(taskUpdate()).toMatchObject({
      evidence_review_status: "rejected",
      status: "pending",
      completed: false,
      evidence_photo_status: { [A]: "approved", [B]: "rejected" },
    });
  });

  it("approving every photo completes the task with the status the student claimed", async () => {
    const result = await reviewEvidencePhotos(TASK, [
      { path: A, decision: "approved" },
      { path: B, decision: "approved" },
    ]);
    expect(result).toEqual({ success: true, outcome: "approved" });
    expect(taskUpdate()).toMatchObject({ evidence_review_status: "approved", status: "done", completed: true });
  });

  it("rejects a task on a single rejection even when the other photo is still undecided", async () => {
    const result = await reviewEvidencePhotos(TASK, [{ path: B, decision: "rejected" }]);
    expect(result).toEqual({ success: true, outcome: "rejected" });
  });

  it("keeps the task waiting when only some photos are approved", async () => {
    const result = await reviewEvidencePhotos(TASK, [{ path: A, decision: "approved" }]);
    expect(result).toEqual({ success: true, outcome: "pending" });
    const update = taskUpdate();
    expect(update).toMatchObject({ evidence_photo_status: { [A]: "approved" } });
    expect(update).not.toHaveProperty("evidence_review_status");
    expect(update).not.toHaveProperty("status");
  });

  it("ignores a verdict for a photo the task does not have", async () => {
    await reviewEvidencePhotos(TASK, [
      { path: A, decision: "approved" },
      { path: "someone-else/x.jpg", decision: "rejected" },
    ]);
    expect(taskUpdate().evidence_photo_status).toEqual({ [A]: "approved" });
  });

  it("a task with no photos has nothing to review", async () => {
    state.task = baseTask({ evidence_review_status: "none", evidence_image_paths: [] });
    expect(await reviewEvidencePhotos(TASK, [{ path: A, decision: "approved" }])).toEqual({
      success: false,
      code: "ALREADY_PROCESSED",
    });
    expect(state.updates).toHaveLength(0);
  });

  it("records verdicts on a task the student has not sent for review, without completing it", async () => {
    state.task = baseTask({ evidence_review_status: "none", status: "pending" });
    const result = await reviewEvidencePhotos(TASK, [
      { path: A, decision: "approved" },
      { path: B, decision: "approved" },
    ]);
    expect(result).toEqual({ success: true, outcome: "approved" });
    const update = taskUpdate();
    expect(update).toMatchObject({ evidence_review_status: "approved", evidence_photo_status: { [A]: "approved", [B]: "approved" } });
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("completed");
  });

  it("a rejection on a not-yet-submitted task flags it for the student without touching its status", async () => {
    state.task = baseTask({ evidence_review_status: "none", status: "pending" });
    const result = await reviewEvidencePhotos(TASK, [{ path: A, decision: "rejected" }]);
    expect(result).toEqual({ success: true, outcome: "rejected" });
    expect(taskUpdate()).toMatchObject({ evidence_review_status: "rejected" });
    expect(taskUpdate()).not.toHaveProperty("status");
  });

  it("rejecting a photo of an already approved, completed task takes the completion back", async () => {
    state.task = baseTask({
      evidence_review_status: "approved",
      status: "done",
      evidence_photo_status: { [A]: "approved", [B]: "approved" },
    });
    const result = await reviewEvidencePhotos(TASK, [{ path: B, decision: "rejected" }]);
    expect(result).toEqual({ success: true, outcome: "rejected" });
    expect(taskUpdate()).toMatchObject({ evidence_review_status: "rejected", status: "pending", completed: false });
  });

  it("the bulk Onayla / Reddet buttons give every photo the same verdict", async () => {
    await approveStudentTask(TASK);
    expect(taskUpdate().evidence_photo_status).toEqual({ [A]: "approved", [B]: "approved" });
    state.updates = [];
    await rejectStudentTask(TASK);
    expect(taskUpdate().evidence_photo_status).toEqual({ [A]: "rejected", [B]: "rejected" });
  });
});

describe("student side of per-photo review", () => {
  it("resubmitting clears the rejected verdicts (up for review again) and keeps the approved ones", async () => {
    state.task = baseTask({
      evidence_review_status: "rejected",
      evidence_photo_status: { [A]: "rejected", [B]: "approved" },
    });
    await updateTaskProgress(TASK, { status: "done", completed: true });
    expect(taskUpdate()).toMatchObject({ evidence_review_status: "pending", evidence_photo_status: { [B]: "approved" } });
  });

  it("deleting a photo drops its verdict but leaves the task's review state alone", async () => {
    state.task = baseTask({
      evidence_review_status: "rejected",
      evidence_photo_status: { [A]: "rejected", [B]: "approved" },
    });
    const result = await removeTaskEvidence(TASK, A);
    expect(result).toMatchObject({ ok: true, paths: [B], reviewStatus: "rejected", photoStatus: { [B]: "approved" } });
    expect(taskUpdate()).toMatchObject({ evidence_image_paths: [B], evidence_photo_status: { [B]: "approved" } });
    expect(taskUpdate()).not.toHaveProperty("evidence_review_status");
  });

  it("a new upload after a resubmission starts unreviewed", async () => {
    state.task = baseTask({ evidence_image_paths: [B], evidence_photo_status: { [B]: "approved" }, status: "pending" });
    const result = await uploadTaskEvidence(photoForm());
    expect(result.ok && result.photoStatus).toEqual({ [B]: "approved" });
  });
});
