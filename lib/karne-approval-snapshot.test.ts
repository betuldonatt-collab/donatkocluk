import { beforeEach, describe, expect, it, vi } from "vitest";

// approveReportCard (app/coach/actions.ts) stores the unified Karne summary on the card at approval: the parent's frozen snapshot.

type Row = Record<string, unknown>;
const CARD = "11111111-1111-4111-8111-111111111111";
const STUDENT = "22222222-2222-4222-8222-222222222222";

const state: { status: "draft" | "approved"; updates: Row[]; summaryCalls: unknown[][]; summaryFails: boolean } = {
  status: "draft",
  updates: [],
  summaryCalls: [],
  summaryFails: false,
};

const SNAPSHOT = { version: 1, period: { start: "2026-10-01", end: "2026-10-28", days: 28 }, completion: { pct: 72, previousPct: 63 } };

vi.mock("@/lib/karne-summary-data", () => ({
  fetchKarneSummary: async (...args: unknown[]) => {
    state.summaryCalls.push(args.slice(1));
    if (state.summaryFails) throw new Error("summary broke");
    return SNAPSHOT;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "coach1" } } }) },
    from(table: string) {
      let isUpdate = false;
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) b[m] = () => b;
      b.update = (payload: Row) => {
        isUpdate = true;
        state.updates.push(payload);
        return b;
      };
      const result = () => {
        if (table === "coach_students") return { data: { student_id: STUDENT }, error: null };
        if (table === "student_report_cards") {
          if (isUpdate) return { data: { id: CARD, ...state.updates[state.updates.length - 1] }, error: null };
          return { data: { student_id: STUDENT, status: state.status, range_start: "2026-10-01", range_end: "2026-10-28" }, error: null };
        }
        return { data: null, error: null };
      };
      b.single = async () => result();
      b.maybeSingle = async () => result();
      return b;
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/impersonation", () => ({ assertNotImpersonating: async () => {}, getViewContext: async () => null }));
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }));

import { approveReportCard } from "@/app/coach/actions";

beforeEach(() => {
  state.status = "draft";
  state.updates = [];
  state.summaryCalls = [];
  state.summaryFails = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("approveReportCard stores the frozen Karne snapshot", () => {
  it("computes the summary for the card's own period and saves it with the approval, next to the single coach note", async () => {
    await approveReportCard(CARD, "Bu dönem düzenliydi.");
    expect(state.summaryCalls).toEqual([[STUDENT, "2026-10-01", "2026-10-28"]]);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ status: "approved", coach_notes: "Bu dönem düzenliydi.", executive_summary: SNAPSHOT });
    expect(state.updates[0].approved_at).toBeTruthy();
  });

  it("an empty note is stored as null, and no extra note column is written", async () => {
    await approveReportCard(CARD, "");
    expect(state.updates[0].coach_notes).toBeNull();
    expect(Object.keys(state.updates[0]).filter((k) => k.includes("note"))).toEqual(["coach_notes"]);
  });

  it("a failure computing the snapshot does not block the approval (the parent's page then computes it from current records)", async () => {
    state.summaryFails = true;
    await approveReportCard(CARD, "Not");
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ status: "approved", coach_notes: "Not" });
    expect(state.updates[0]).not.toHaveProperty("executive_summary");
  });

  it("an already approved card is refused before anything is computed or written", async () => {
    state.status = "approved";
    await expect(approveReportCard(CARD, "x")).rejects.toThrow("zaten onaylanmış");
    expect(state.summaryCalls).toEqual([]);
    expect(state.updates).toEqual([]);
  });
});
