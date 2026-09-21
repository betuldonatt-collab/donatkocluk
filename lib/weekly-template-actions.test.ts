import { beforeEach, describe, expect, it, vi } from "vitest";

// Applying / previewing a weekly template against a mocked Supabase client: this
// pins down the parts that live in TypeScript (Monday check, cohort match, locked
// weeks, the "already applied" confirmation, and per-day ordering across items).
// The table/RLS side is covered by migration 0087's own verification query.

type Row = Record<string, unknown>;

const MONDAY = "2026-09-21";
const COACH = "u1";
const STUDENT = "22222222-2222-4222-8222-222222222222";
const TEMPLATE = "33333333-3333-4333-8333-333333333333";

const state: {
  linked: boolean;
  studentExamType: string;
  template: Row | null;
  locked: boolean;
  applied: Row[];
  existingTasks: Row[];
  inserts: { table: string; rows: unknown }[];
} = { linked: true, studentExamType: "LGS", template: null, locked: false, applied: [], existingTasks: [], inserts: [] };

function templateRow(overrides: Row = {}): Row {
  return {
    id: TEMPLATE,
    name: "LGS Temel Hafta",
    exam_type: "LGS",
    updated_at: "2026-09-01T00:00:00Z",
    weekly_template_items: [
      // Every day: 15 pages of reading.
      { id: "i1", order_index: 0, days: [0, 1, 2, 3, 4, 5, 6], task: { taskType: "reading", bookTitle: "Sefiller", totalCount: 15 } },
      // Saturday only: an LGS general exam.
      { id: "i2", order_index: 1, days: [5], task: { taskType: "general_exam", generalExamTrack: "lgs" } },
    ],
    ...overrides,
  };
}

function builder(table: string) {
  let op: "select" | "insert" = "select";
  let insertedRows: unknown = null;
  const result = () => {
    if (op === "insert") {
      state.inserts.push({ table, rows: insertedRows });
      return { data: null, error: null };
    }
    switch (table) {
      case "coach_students":
        return { data: state.linked ? { student_id: STUDENT } : null, error: null };
      case "weekly_templates":
        return { data: state.template, error: null };
      case "profiles":
        return { data: { exam_type: state.studentExamType }, error: null };
      case "week_locks":
        return { data: state.locked ? { id: "l1" } : null, error: null };
      case "weekly_template_applications":
        return { data: state.applied, error: null };
      case "student_tasks":
        return { data: state.existingTasks, error: null, count: state.existingTasks.length };
      default:
        return { data: [], error: null };
    }
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte", "in", "order", "limit"]) b[m] = () => b;
  b.insert = (rows: unknown) => {
    op = "insert";
    insertedRows = rows;
    return b;
  };
  b.maybeSingle = () => Promise.resolve(result());
  b.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return b;
}

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: COACH } } }) },
  from: (table: string) => builder(table),
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { applyWeeklyTemplate, previewWeeklyTemplate } from "../app/coach/actions";

const input = { templateId: TEMPLATE, studentId: STUDENT, weekStart: MONDAY };

beforeEach(() => {
  state.linked = true;
  state.studentExamType = "LGS";
  state.template = templateRow();
  state.locked = false;
  state.applied = [];
  state.existingTasks = [];
  state.inserts = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applyWeeklyTemplate", () => {
  it("creates one card per item per day, on the right dates, and logs the application", async () => {
    const result = await applyWeeklyTemplate(input);
    expect(result).toEqual({ ok: true, created: 8 }); // 7 readings + 1 Saturday exam

    const tasks = state.inserts.find((i) => i.table === "student_tasks")?.rows as Row[];
    expect(tasks).toHaveLength(8);
    expect(tasks.filter((t) => t.task_type === "reading").map((t) => t.task_date)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
    expect(tasks.find((t) => t.task_type === "general_exam")?.task_date).toBe("2026-09-26");

    const log = state.inserts.find((i) => i.table === "weekly_template_applications")?.rows as Row;
    expect(log).toMatchObject({ template_id: TEMPLATE, student_id: STUDENT, coach_id: COACH, week_start: MONDAY, task_count: 8 });
  });

  it("keeps later items after earlier ones on the same day", async () => {
    await applyWeeklyTemplate(input);
    const tasks = state.inserts.find((i) => i.table === "student_tasks")?.rows as Row[];
    const saturday = tasks.filter((t) => t.task_date === "2026-09-26").sort((a, b) => (a.order_index as number) - (b.order_index as number));
    expect(saturday.map((t) => t.task_type)).toEqual(["reading", "general_exam"]);
    expect(saturday[0].order_index).not.toBe(saturday[1].order_index);
  });

  it("rejects a start date that is not a Monday and writes nothing", async () => {
    const result = await applyWeeklyTemplate({ ...input, weekStart: "2026-09-22" });
    expect(result).toEqual({ ok: false, error: "Başlangıç tarihi bir Pazartesi olmalı." });
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses a template of the other cohort", async () => {
    state.studentExamType = "YKS";
    const result = await applyWeeklyTemplate(input);
    expect(result.ok).toBe(false);
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses a student who is not on the coach's roster", async () => {
    state.linked = false;
    const result = await applyWeeklyTemplate(input);
    expect(result).toEqual({ ok: false, error: "Bu öğrenci sana atanmamış." });
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses a locked week", async () => {
    state.locked = true;
    const result = await applyWeeklyTemplate(input);
    expect(result).toEqual({ ok: false, error: "Bu hafta kilitli; şablon uygulanamaz." });
    expect(state.inserts).toHaveLength(0);
  });

  it("asks for confirmation when the same template was already applied, and applies with force", async () => {
    state.applied = [{ id: "a1" }];
    const first = await applyWeeklyTemplate(input);
    expect(first).toMatchObject({ ok: false, needsConfirm: true });
    expect(state.inserts).toHaveLength(0);

    const forced = await applyWeeklyTemplate({ ...input, force: true });
    expect(forced).toEqual({ ok: true, created: 8 });
  });

  it("reports a missing template", async () => {
    state.template = null;
    expect(await applyWeeklyTemplate(input)).toEqual({ ok: false, error: "Şablon bulunamadı." });
  });
});

describe("previewWeeklyTemplate", () => {
  it("reports the task count, what the week already holds, and the earlier application", async () => {
    state.existingTasks = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];
    state.applied = [{ created_at: "2026-09-10T10:00:00Z" }];
    const result = await previewWeeklyTemplate(input);
    expect(result).toEqual({
      ok: true,
      data: { taskCount: 8, existingTaskCount: 3, appliedBefore: "2026-09-10T10:00:00Z", locked: false },
    });
  });

  it("flags a locked week", async () => {
    state.locked = true;
    const result = await previewWeeklyTemplate(input);
    expect(result.ok && result.data.locked).toBe(true);
  });
});
