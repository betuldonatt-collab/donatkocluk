import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { findMissingTasks } from "./missing-tasks";
import { addDaysISO, formatShortDate, isTransferable, postponedLabel, statusWhenPostponed, targetDateFor } from "./task-transfer";

// ---- an in-memory Supabase: just enough of the query builder for transferAssignedTasks ----
type Row = Record<string, unknown>;
const COACH = "c0c0c0c0-0000-4000-8000-000000000001";
const STUDENT = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;

const db: Record<string, Row[]> = {};
const failures = new Set<string>();
let nextId = 100;

function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] = {};
  const run = () => {
    if (failures.has(`${op}:${table}`)) return { data: null, error: { message: "boom" } };
    const rows = (db[table] ??= []);
    if (op === "insert") {
      const made = (payload as Row[]).map((r) => ({ id: id(nextId++), status: "pending", created_at: "now", ...r }));
      rows.push(...made);
      return { data: made, error: null };
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (op === "update") {
      for (const r of hit) Object.assign(r, payload);
      return { data: hit, error: null };
    }
    if (op === "delete") {
      db[table] = rows.filter((r) => !hit.includes(r));
      return { data: hit, error: null };
    }
    return { data: hit, error: null };
  };
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.order = () => b;
  b.eq = (col: string, v: unknown) => (filters.push((r) => r[col] === v), b);
  b.in = (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b);
  b.insert = (p: Row[]) => ((op = "insert"), (payload = p), b);
  b.update = (p: Row) => ((op = "update"), (payload = p), b);
  b.delete = () => ((op = "delete"), b);
  b.single = () => Promise.resolve({ ...run(), data: run().data?.[0] ?? null });
  b.maybeSingle = b.single;
  b.then = (resolve: (v: unknown) => unknown) => resolve(run());
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
// useSortable needs a DndContext; the card's own markup is what matters here.
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }),
}));

import { transferAssignedTasks } from "@/app/coach/actions";
import { KanbanTaskCard } from "@/app/coach/students/[id]/_components/kanban/kanban-task-card";
import { RoutineTaskCard } from "@/app/coach/students/[id]/_components/kanban/routine-task-card";
import type { DetailTask } from "@/app/coach/students/[id]/types";

function task(n: number, overrides: Row = {}): Row {
  return {
    id: id(n),
    student_id: STUDENT,
    coach_id: COACH,
    task_date: "2026-10-01",
    task_type: "question_bank",
    title: "Soru Çözümü",
    description: "Not " + n,
    course_id: "tyt-matematik",
    topic_id: "tyt-matematik-u0-t0",
    total_count: 40,
    duration_minutes: 30,
    video_links: [{ url: "https://x.test/v", title: "v" }],
    order_index: n,
    status: "pending",
    postponed_to: null,
    is_coach_assigned: true,
    is_approved_by_coach: true,
    // what a student leaves behind -- none of it may reach the copy
    correct_count: 10,
    wrong_count: 5,
    empty_count: 1,
    evidence_image_paths: ["a.jpg"],
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  failures.clear();
  nextId = 100;
  db.coach_students = [{ coach_id: COACH, student_id: STUDENT }];
  db.student_events = [];
  db.task_resources = [];
  db.student_tasks = [task(1), task(2, { task_date: "2026-10-02", status: "half_done" }), task(3, { status: "done" }), task(4, { status: "not_done", task_date: "2026-10-02", order_index: 0 })];
});

describe("pure rules", () => {
  it("only a task that is not done and not yet postponed can be transferred", () => {
    expect(isTransferable({ status: "pending" })).toBe(true);
    expect(isTransferable({ status: "not_done" })).toBe(true);
    expect(isTransferable({ status: "half_done" })).toBe(true);
    expect(isTransferable({ status: "done" })).toBe(false);
    expect(isTransferable({ status: "not_done", postponed_to: "2026-10-05" })).toBe(false);
  });
  it("an unmarked task becomes Yapılmadı, anything else keeps its status", () => {
    expect(statusWhenPostponed("pending")).toBe("not_done");
    expect(statusWhenPostponed("half_done")).toBe("half_done");
    expect(statusWhenPostponed("not_done")).toBe("not_done");
  });
  it("labels", () => {
    expect(formatShortDate("2026-10-14")).toBe("14 Eki");
    expect(formatShortDate("2026-01-03")).toBe("3 Oca");
    expect(postponedLabel({ status: "not_done", postponed_to: "2026-10-14" })).toBe("Ertelendi → 14 Eki");
    expect(postponedLabel({ status: "done", postponed_to: "2026-10-14" })).toBeNull();
    expect(postponedLabel({ status: "not_done", postponed_to: null })).toBeNull();
  });
});

describe("transferAssignedTasks", () => {
  it("copies the selected tasks fresh onto the new date and keeps the originals, marked Ertelendi", async () => {
    db.task_resources = [{ task_id: id(1), resource_id: "r1", order_index: 0 }, { task_id: id(1), resource_id: "r2", order_index: 1 }];
    const result = await transferAssignedTasks(STUDENT, [id(1), id(2)], { mode: "date", date: "2026-10-08" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // nothing was deleted
    expect(db.student_tasks.filter((t) => [id(1), id(2), id(3), id(4)].includes(t.id as string))).toHaveLength(4);
    expect(db.student_tasks).toHaveLength(6);

    const copies = db.student_tasks.filter((t) => t.task_date === "2026-10-08");
    expect(copies).toHaveLength(2);
    for (const c of copies) {
      expect(c).toMatchObject({ status: "pending", is_coach_assigned: true, is_approved_by_coach: true, coach_id: COACH, student_id: STUDENT });
      expect(c.correct_count).toBeUndefined();
      expect(c.evidence_image_paths).toBeUndefined();
      expect(c.postponed_to).toBeUndefined();
    }
    // content carried over, board order kept (the earlier day's task first), appended in the new day
    expect(copies.map((c) => c.description)).toEqual(["Not 1", "Not 2"]);
    expect(copies.map((c) => c.order_index)).toEqual([0, 1]);
    expect(copies[0]).toMatchObject({ course_id: "tyt-matematik", topic_id: "tyt-matematik-u0-t0", total_count: 40, duration_minutes: 30, task_type: "question_bank" });
    expect(copies[0].video_links).toEqual([{ url: "https://x.test/v", title: "v" }]);
    expect(db.task_resources.filter((r) => r.task_id === copies[0].id).map((r) => r.resource_id)).toEqual(["r1", "r2"]);

    // originals: the unmarked one becomes Yapılmadı, the half-done one keeps its status; both flagged
    expect(db.student_tasks.find((t) => t.id === id(1))).toMatchObject({ status: "not_done", postponed_to: "2026-10-08" });
    expect(db.student_tasks.find((t) => t.id === id(2))).toMatchObject({ status: "half_done", postponed_to: "2026-10-08" });
    // the ones not selected are untouched
    expect(db.student_tasks.find((t) => t.id === id(4))!.postponed_to).toBeNull();
    expect(result.postponed).toEqual([
      { id: id(1), status: "not_done", postponed_to: "2026-10-08" },
      { id: id(2), status: "half_done", postponed_to: "2026-10-08" },
    ]);
    expect(result.created).toHaveLength(2);
    expect(result.created[0].resource_ids).toEqual(["r1", "r2"]);
  });

  it("appends after what the new day already holds", async () => {
    db.student_tasks.push(task(9, { task_date: "2026-10-08", order_index: 4 }));
    await transferAssignedTasks(STUDENT, [id(1)], { mode: "date", date: "2026-10-08" });
    const copy = db.student_tasks.find((t) => t.task_date === "2026-10-08" && t.id !== id(9))!;
    expect(copy.order_index).toBe(5);
  });

  it("leaves finished and already-postponed tasks out, and refuses when nothing is left", async () => {
    const partly = await transferAssignedTasks(STUDENT, [id(1), id(3)], { mode: "date", date: "2026-10-08" });
    expect(partly.ok && partly.created).toHaveLength(1);
    expect(partly.ok && partly.skipped).toBe(1);
    expect(db.student_tasks.find((t) => t.id === id(3))!.postponed_to).toBeNull();

    // id(1) is postponed now: a second transfer of it (and the done one) has nothing to do
    const before = db.student_tasks.length;
    const again = await transferAssignedTasks(STUDENT, [id(1), id(3)], { mode: "date", date: "2026-10-09" });
    expect(again.ok).toBe(false);
    expect(db.student_tasks).toHaveLength(before);
  });

  it("rejects another student's task, an empty selection and a bad date", async () => {
    db.student_tasks.push(task(7, { student_id: "33333333-3333-4333-8333-333333333333" }));
    expect((await transferAssignedTasks(STUDENT, [id(1), id(7)], { mode: "date", date: "2026-10-08" })).ok).toBe(false);
    expect((await transferAssignedTasks(STUDENT, [], { mode: "date", date: "2026-10-08" })).ok).toBe(false);
    expect((await transferAssignedTasks(STUDENT, [id(1)], { mode: "date", date: "yarın" })).ok).toBe(false);
    expect(db.student_tasks.filter((t) => t.task_date === "2026-10-08")).toHaveLength(0);
  });

  it("rolls the copies back if the originals cannot be marked (a retry must not hand the work out twice)", async () => {
    failures.add("update:student_tasks");
    const result = await transferAssignedTasks(STUDENT, [id(1), id(2)], { mode: "date", date: "2026-10-08" });
    expect(result.ok).toBe(false);
    expect(db.student_tasks.filter((t) => t.task_date === "2026-10-08")).toHaveLength(0);
    expect(db.student_tasks).toHaveLength(4);
  });

  it("returns the error instead of throwing", async () => {
    failures.add("insert:student_tasks");
    const result = await transferAssignedTasks(STUDENT, [id(1)], { mode: "date", date: "2026-10-08" });
    expect(result).toMatchObject({ ok: false });
  });
});

describe("a postponed task is not 'missing' any more", () => {
  const base = { task_type: "question_bank", course_id: "tyt-matematik", is_approved_by_coach: true };
  it("is skipped by the Tamamlanmayan Görevler rule, while an ordinary missed task is listed", () => {
    const list = findMissingTasks(
      [
        { id: "a", task_date: "2026-10-01", status: "not_done", ...base },
        { id: "b", task_date: "2026-10-01", status: "not_done", postponed_to: "2026-10-08", ...base },
      ],
      "2026-10-05",
      { requiresPhoto: false },
    );
    expect(list.map((m) => m.task.id)).toEqual(["a"]);
  });
});

describe("Toplu İşlem on the cards", () => {
  const detail = (over: Partial<DetailTask> = {}): DetailTask =>
    ({ ...(task(1) as unknown as DetailTask), resource_ids: [], is_locked: false, completed: false, subject_scores: null, analysis_pending: false, ...over }) as DetailTask;
  const props = {
    studentId: STUDENT,
    onEdit: () => {},
    onDuplicate: () => {},
    onDelete: () => {},
    onStatusChange: () => {},
    onToggleLock: () => {},
    paintMode: null,
    onToggleSelect: () => {},
    cardHeight: 160,
    onResize: () => {},
    onResizeEnd: () => {},
  };

  it("shows a checkbox on every card while select mode is on, and none otherwise", () => {
    expect(renderToStaticMarkup(<KanbanTaskCard {...props} task={detail()} selectMode={false} selected={false} />)).not.toContain('role="checkbox"');
    const on = renderToStaticMarkup(<KanbanTaskCard {...props} task={detail()} selectMode selected={false} />);
    expect(on).toContain('role="checkbox"');
    expect(on).toContain('aria-checked="false"');
    expect(renderToStaticMarkup(<KanbanTaskCard {...props} task={detail()} selectMode selected />)).toContain('aria-checked="true"');
    expect(renderToStaticMarkup(<RoutineTaskCard {...props} task={detail()} selectMode selected={false} />)).toContain('role="checkbox"');
  });

  it("a done or already-postponed task shows a disabled checkbox", () => {
    expect(renderToStaticMarkup(<KanbanTaskCard {...props} task={detail({ status: "done" })} selectMode selected={false} />)).toContain('aria-disabled="true"');
    expect(renderToStaticMarkup(<KanbanTaskCard {...props} task={detail({ postponed_to: "2026-10-08" })} selectMode selected={false} />)).toContain('aria-disabled="true"');
    expect(renderToStaticMarkup(<KanbanTaskCard {...props} task={detail()} selectMode selected={false} />)).toContain('aria-disabled="false"');
  });

  it("a postponed task carries the Ertelendi badge with the new date; an ordinary one does not", () => {
    const html = renderToStaticMarkup(<KanbanTaskCard {...props} task={detail({ status: "not_done", postponed_to: "2026-10-14" })} selectMode={false} selected={false} />);
    expect(html).toContain("Ertelendi → 14 Eki");
    expect(renderToStaticMarkup(<KanbanTaskCard {...props} task={detail()} selectMode={false} selected={false} />)).not.toContain("Ertelendi");
    expect(renderToStaticMarkup(<RoutineTaskCard {...props} task={detail({ status: "not_done", postponed_to: "2026-10-14" })} selectMode={false} selected={false} />)).toContain("Ertelendi → 14 Eki");
  });
});

describe("+7 days: every task moves to the same weekday next week", () => {
  // Mon 2026-10-05 .. Sun 2026-10-11, several tasks per day, a done one among them
  beforeEach(() => {
    db.student_tasks = [
      task(1, { task_date: "2026-10-05", order_index: 0 }),
      task(2, { task_date: "2026-10-05", order_index: 1 }),
      task(3, { task_date: "2026-10-07", order_index: 0 }), // Wednesday
      task(4, { task_date: "2026-10-07", order_index: 1, status: "half_done" }),
      task(5, { task_date: "2026-10-09", order_index: 0, status: "not_done" }),
      task(6, { task_date: "2026-10-09", order_index: 1, status: "done" }),
      task(7, { task_date: "2026-10-11", order_index: 0 }),
      task(8, { task_date: "2026-10-15", order_index: 3 }), // already something next week
    ];
  });
  const shift = { mode: "shift", days: 7 } as const;
  const selected = [id(1), id(2), id(3), id(4), id(5), id(6), id(7)];
  const copiesOn = (date: string) => db.student_tasks.filter((t) => t.task_date === date && !t.postponed_to && ![id(1), id(2), id(3), id(4), id(5), id(6), id(7), id(8)].includes(t.id as string));

  it("the pure rule: a date plus seven days keeps the weekday, across month and year ends", () => {
    expect(addDaysISO("2026-10-07", 7)).toBe("2026-10-14");
    expect(addDaysISO("2026-10-28", 7)).toBe("2026-11-04");
    expect(addDaysISO("2026-12-30", 7)).toBe("2027-01-06");
    expect(targetDateFor({ task_date: "2026-10-07" }, { mode: "shift", days: 7 })).toBe("2026-10-14");
    expect(targetDateFor({ task_date: "2026-10-07" }, { mode: "date", date: "2026-11-01" })).toBe("2026-11-01");
    const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
    expect(weekday(addDaysISO("2026-10-07", 7))).toBe(weekday("2026-10-07"));
  });

  it("each copy lands on its own task's day +7 -- nothing is piled onto one day", async () => {
    const result = await transferAssignedTasks(STUDENT, selected, shift);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(copiesOn("2026-10-12")).toHaveLength(2); // Monday's two
    expect(copiesOn("2026-10-14")).toHaveLength(2); // Wednesday's two
    expect(copiesOn("2026-10-16")).toHaveLength(1); // Friday's not-done one (the done one is skipped)
    expect(copiesOn("2026-10-18")).toHaveLength(1); // Sunday's
    for (const d of ["2026-10-13", "2026-10-15", "2026-10-17"]) expect(copiesOn(d)).toHaveLength(0);
    expect(result.created).toHaveLength(6);
    expect(result.skipped).toBe(1);
    expect(result.targetDates).toEqual(["2026-10-12", "2026-10-14", "2026-10-16", "2026-10-18"]);
  });

  it("each original is marked Ertelendi with ITS OWN new day, and nothing is deleted", async () => {
    const result = await transferAssignedTasks(STUDENT, selected, shift);
    expect(result.ok).toBe(true);
    const row = (n: number) => db.student_tasks.find((t) => t.id === id(n))!;
    expect(row(1).postponed_to).toBe("2026-10-12");
    expect(row(3).postponed_to).toBe("2026-10-14");
    expect(row(5).postponed_to).toBe("2026-10-16");
    expect(row(7).postponed_to).toBe("2026-10-18");
    expect(row(6).postponed_to).toBeNull(); // done: left alone
    // unmarked -> Yapılmadı, half-done keeps its status
    expect(row(1).status).toBe("not_done");
    expect(row(4).status).toBe("half_done");
    expect(db.student_tasks).toHaveLength(8 + 6);
    if (result.ok) expect(result.postponed.find((p) => p.id === id(3))).toEqual({ id: id(3), status: "not_done", postponed_to: "2026-10-14" });
  });

  it("copies keep the board's order within their day and go after what the day already holds", async () => {
    db.student_tasks.push(task(9, { task_date: "2026-10-12", order_index: 4 })); // Monday next week already has a task at 4
    await transferAssignedTasks(STUDENT, [id(1), id(2)], shift);
    const monday = db.student_tasks.filter((t) => t.task_date === "2026-10-12").sort((a, b) => (a.order_index as number) - (b.order_index as number));
    expect(monday.map((t) => [t.description, t.order_index])).toEqual([["Not 9", 4], ["Not 1", 5], ["Not 2", 6]]);
  });

  it("a month-end task crosses into the next month on the same weekday", async () => {
    db.student_tasks = [task(1, { task_date: "2026-10-28" })];
    await transferAssignedTasks(STUDENT, [id(1)], shift);
    expect(db.student_tasks.find((t) => t.id !== id(1))!.task_date).toBe("2026-11-04");
  });

  it("rejects a nonsense shift, and the one-day mode still works", async () => {
    expect((await transferAssignedTasks(STUDENT, [id(1)], { mode: "shift", days: 0 })).ok).toBe(false);
    expect((await transferAssignedTasks(STUDENT, [id(1)], { mode: "shift", days: 7.5 })).ok).toBe(false);
    expect((await transferAssignedTasks(STUDENT, [id(1)], { mode: "shift", days: 9999 })).ok).toBe(false);
    expect(db.student_tasks).toHaveLength(8);
    const one = await transferAssignedTasks(STUDENT, [id(1), id(3)], { mode: "date", date: "2026-10-20" });
    expect(one.ok && one.targetDates).toEqual(["2026-10-20"]);
    expect(db.student_tasks.filter((t) => t.task_date === "2026-10-20")).toHaveLength(2);
  });
});
