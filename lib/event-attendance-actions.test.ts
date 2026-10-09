import { beforeEach, describe, expect, it, vi } from "vitest";

type Op = { table: string; op: "select" | "upsert" | "delete"; payload?: unknown; filters: [string, string, unknown][]; options?: unknown };
let ops: Op[] = [];
let roster: string[] = [];
let announcementExists = true;
let failOn: { table: string; op: Op["op"] } | null = null;

vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {} }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "coach1" } } }) },
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.upsert = (payload: unknown, options: unknown) => {
        op.op = "upsert";
        op.payload = payload;
        op.options = options;
        return b;
      };
      b.delete = () => {
        op.op = "delete";
        return b;
      };
      for (const m of ["eq", "in", "gt"]) {
        b[m] = (col: string, value: unknown) => {
          op.filters.push([m, col, value]);
          return b;
        };
      }
      const finish = () => {
        ops.push(op);
        if (failOn && failOn.table === table && failOn.op === op.op) return { data: null, error: { message: "boom", code: "XX000" } };
        if (table === "coach_students") return { data: roster.map((student_id) => ({ student_id })), error: null };
        if (table === "announcements") return { data: announcementExists ? { id: "x" } : null, error: null };
        return { data: null, error: null };
      };
      b.maybeSingle = async () => finish();
      b.then = (resolve: (v: unknown) => unknown) => resolve(finish());
      return b;
    },
  }),
}));

import { saveEventAttendance } from "@/app/coach/events/actions";

const A = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222222";
const S2 = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  ops = [];
  roster = [S1, S2];
  announcementExists = true;
  failOn = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const writes = () => ops.filter((o) => o.op !== "select");

describe("saveEventAttendance: validation (nothing is written)", () => {
  it("the session count must be a whole number from 1 to 20", async () => {
    for (const count of [0, 21, 2.5, -1]) {
      const r = await saveEventAttendance(A, count, []);
      expect(r.success, String(count)).toBe(false);
    }
    expect(ops).toEqual([]);
  });

  it("a mark for a session beyond the count is refused", async () => {
    const r = await saveEventAttendance(A, 2, [{ studentId: S1, sessionNumber: 3, status: "attended" }]);
    expect(r).toMatchObject({ success: false });
    expect(writes()).toEqual([]);
  });

  it("a student who is not on the coach's roster is refused", async () => {
    const r = await saveEventAttendance(A, 1, [{ studentId: OTHER, sessionNumber: 1, status: "attended" }]);
    expect(r).toEqual({ success: false, error: "Bu öğrenci sana atanmamış." });
    expect(writes()).toEqual([]);
  });

  it("an unknown event is refused", async () => {
    announcementExists = false;
    const r = await saveEventAttendance(A, 1, [{ studentId: S1, sessionNumber: 1, status: "attended" }]);
    expect(r).toEqual({ success: false, error: "Etkinlik bulunamadı." });
    expect(writes()).toEqual([]);
  });

  it("malformed ids or statuses are refused", async () => {
    expect((await saveEventAttendance("not-a-uuid", 1, [])).success).toBe(false);
    expect((await saveEventAttendance(A, 1, [{ studentId: S1, sessionNumber: 1, status: "maybe" as never }])).success).toBe(false);
  });
});

describe("saveEventAttendance: the roll call is saved in one go", () => {
  it("stores the session count, trims sessions that no longer exist, clears unmarked cells and upserts the marks (per student, per session)", async () => {
    const result = await saveEventAttendance(A, 2, [
      { studentId: S1, sessionNumber: 1, status: "attended" },
      { studentId: S1, sessionNumber: 2, status: "not_attended" },
      { studentId: S2, sessionNumber: 1, status: null },
      { studentId: S2, sessionNumber: 2, status: "attended" },
    ]);
    expect(result).toEqual({ success: true, sessionCount: 2 });

    const w = writes();
    // 1. the count (shared by every coach)
    expect(w[0]).toMatchObject({ table: "announcement_attendance_config", op: "upsert", options: { onConflict: "announcement_id" } });
    expect(w[0].payload).toMatchObject({ announcement_id: A, session_count: 2, updated_by: "coach1" });
    // 2. records of sessions beyond the count, for the coach's own roster
    expect(w[1]).toMatchObject({ table: "announcement_attendance", op: "delete" });
    expect(w[1].filters).toContainEqual(["gt", "session_number", 2]);
    expect(w[1].filters).toContainEqual(["in", "student_id", [S1, S2]]);
    // 3. the cleared cell: one delete for session 1 of S2
    expect(w[2]).toMatchObject({ table: "announcement_attendance", op: "delete" });
    expect(w[2].filters).toContainEqual(["eq", "session_number", 1]);
    expect(w[2].filters).toContainEqual(["in", "student_id", [S2]]);
    // 4. the marks, on the (event, student, session) key
    expect(w[3]).toMatchObject({ table: "announcement_attendance", op: "upsert", options: { onConflict: "announcement_id,student_id,session_number" } });
    expect(w[3].payload).toMatchObject([
      { announcement_id: A, student_id: S1, session_number: 1, status: "attended", marked_by: "coach1" },
      { announcement_id: A, student_id: S1, session_number: 2, status: "not_attended" },
      { announcement_id: A, student_id: S2, session_number: 2, status: "attended" },
    ]);
  });

  it("when the same student and session appear twice, the last mark wins", async () => {
    await saveEventAttendance(A, 1, [
      { studentId: S1, sessionNumber: 1, status: "attended" },
      { studentId: S1, sessionNumber: 1, status: "not_attended" },
    ]);
    const upsert = writes().find((o) => o.table === "announcement_attendance" && o.op === "upsert")!;
    expect(upsert.payload).toMatchObject([{ student_id: S1, session_number: 1, status: "not_attended" }]);
  });

  it("a database failure comes back as a plain { success: false, error } -- it never throws", async () => {
    failOn = { table: "announcement_attendance", op: "upsert" };
    const r = await saveEventAttendance(A, 1, [{ studentId: S1, sessionNumber: 1, status: "attended" }]);
    expect(r.success).toBe(false);
    expect(typeof (r as { error: string }).error).toBe("string");
  });
});
