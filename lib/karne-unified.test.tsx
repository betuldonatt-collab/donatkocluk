import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KarneDocument } from "@/components/karne-document";
import { asKarneSnapshot, loadKarneSummary } from "@/lib/karne-summary-data";
import { computeKarneSummary, KARNE_SUMMARY_VERSION, type KarneSummary } from "@/lib/karne-summary";
import { karneDocumentProps } from "@/lib/karne-view";

// The Karne a coach previews / prints, the one a student opens and the one a parent reads must be the SAME document with the SAME
// figures: one loader (loadKarneSummary), one prop builder (karneDocumentProps), one component (KarneDocument).

const STUDENT = "22222222-2222-4222-8222-222222222222";

function summaryOf(rangeStart: string, rangeEnd: string): KarneSummary {
  return computeKarneSummary({ rangeStart, rangeEnd, today: "2026-10-20", now: "2026-10-20T10:00:00.000Z", tasks: [], events: [], aytTrack: null, maarifGrade: null });
}

// A database that has no records, except the student's report-card row.
function fakeSupabase(reportCard: { executive_summary: unknown } | null) {
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  const from = (table: string) => {
    const call = { table, filters: [] as [string, unknown][] };
    calls.push(call);
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ["select", "order", "limit", "gte", "lte", "in", "not", "or", "is", "neq", "range"]) q[m] = chain;
    q.eq = (col: string, value: unknown) => (call.filters.push([col, value]), q);
    q.maybeSingle = async () => ({ data: table === "student_report_cards" ? reportCard : null, error: null });
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, count: 0 });
    return q;
  };
  return { supabase: { from, rpc: async () => ({ data: [], error: null }) } as never, calls };
}

describe("loadKarneSummary: one source of numbers for every panel", () => {
  it("a period that is an approved report card reads the snapshot its approval stored -- frozen, for everyone", async () => {
    const snapshot = summaryOf("2026-10-01", "2026-10-14");
    const { supabase, calls } = fakeSupabase({ executive_summary: snapshot });
    const loaded = await loadKarneSummary(supabase, STUDENT, "2026-10-01", "2026-10-14");
    expect(loaded.frozen).toBe(true);
    expect(loaded.summary).toEqual(snapshot);
    // the snapshot lookup is for an APPROVED card of exactly that period
    const lookup = calls.find((c) => c.table === "student_report_cards");
    expect(lookup?.filters).toEqual(
      expect.arrayContaining([
        ["student_id", STUDENT],
        ["status", "approved"],
        ["range_start", "2026-10-01"],
        ["range_end", "2026-10-14"],
      ]),
    );
    // nothing else was read: no live computation behind a frozen Karne
    expect(calls.some((c) => c.table === "student_tasks")).toBe(false);
  });

  it("any other period (no approved card, or one approved before snapshots existed) is computed live, by the same function", async () => {
    const { supabase, calls } = fakeSupabase(null);
    const loaded = await loadKarneSummary(supabase, STUDENT, "2026-10-01", "2026-10-14", { today: "2026-10-20" });
    expect(loaded.frozen).toBe(false);
    expect(loaded.summary.period).toMatchObject({ start: "2026-10-01", end: "2026-10-14" });
    expect(calls.some((c) => c.table === "student_tasks")).toBe(true);

    const legacy = fakeSupabase({ executive_summary: null });
    expect((await loadKarneSummary(legacy.supabase, STUDENT, "2026-10-01", "2026-10-14", { today: "2026-10-20" })).frozen).toBe(false);
  });

  it("a stored snapshot of another version or shape is not trusted (it is recomputed)", async () => {
    const stale = { ...summaryOf("2026-10-01", "2026-10-14"), version: KARNE_SUMMARY_VERSION + 99 };
    expect(asKarneSnapshot(stale)).toBeNull();
    expect(asKarneSnapshot({})).toBeNull();
    expect(asKarneSnapshot(null)).toBeNull();
    expect(asKarneSnapshot(summaryOf("2026-10-01", "2026-10-14"))).not.toBeNull();
    const { supabase } = fakeSupabase({ executive_summary: stale });
    expect((await loadKarneSummary(supabase, STUDENT, "2026-10-01", "2026-10-14", { today: "2026-10-20" })).frozen).toBe(false);
  });
});

describe("karneDocumentProps: the same header, note and badge for every viewer", () => {
  const loaded = { summary: summaryOf("2026-10-01", "2026-10-14"), frozen: true };
  const student = { fullName: "Ayşe Yılmaz", sinifSube: "11-A", examType: "YKS" };
  const approved = { status: "approved" as const, cycle_number: 3, approved_at: "2026-10-15T09:00:00Z", coach_notes: "Harika bir dönem." };
  const draft = { status: "draft" as const, cycle_number: 4, approved_at: null, coach_notes: "Taslak not" };

  it("the class line is the section, else the exam type", () => {
    expect(karneDocumentProps({ loaded, student, card: null }).classLabel).toBe("11-A");
    expect(karneDocumentProps({ loaded, student: { ...student, sinifSube: null }, card: null }).classLabel).toBe("YKS");
    expect(karneDocumentProps({ loaded, student: { ...student, sinifSube: null, examType: null }, card: null }).classLabel).toBeNull();
  });
  it("an approved card brings its note and the 'Koç onaylı' badge", () => {
    const props = karneDocumentProps({ loaded, student, card: approved });
    expect(props.coachNote).toBe("Harika bir dönem.");
    expect(props.approval).toEqual({ approvedAt: "2026-10-15T09:00:00Z", cycleNumber: 3 });
    expect(props.frozen).toBe(true);
  });
  it("a draft's note is the coach's alone: students and parents never get it, no badge for anyone", () => {
    const forStudent = karneDocumentProps({ loaded, student, card: draft });
    expect(forStudent.coachNote).toBeNull();
    expect(forStudent.approval).toBeNull();
    const forCoach = karneDocumentProps({ loaded, student, card: draft, includeDraftNote: true });
    expect(forCoach.coachNote).toBe("Taslak not");
    expect(forCoach.approval).toBeNull();
  });
  it("a period that is no report card has no note and no badge", () => {
    const props = karneDocumentProps({ loaded: { ...loaded, frozen: false }, student, card: null });
    expect(props.coachNote).toBeNull();
    expect(props.approval).toBeNull();
    expect(props.frozen).toBe(false);
  });

  it("the coach, the student and the parent are given identical props -- so the printed document is identical", () => {
    const coach = karneDocumentProps({ loaded, student, card: approved, includeDraftNote: true });
    const studentView = karneDocumentProps({ loaded, student, card: approved });
    const parentView = karneDocumentProps({ loaded, student, card: approved });
    expect(coach).toEqual(studentView);
    expect(studentView).toEqual(parentView);
    const html = renderToStaticMarkup(<KarneDocument {...coach} />);
    expect(renderToStaticMarkup(<KarneDocument {...studentView} />)).toBe(html);
    expect(renderToStaticMarkup(<KarneDocument {...parentView} />)).toBe(html);
    expect(html).toContain("Ayşe Yılmaz");
    expect(html).toContain("11-A");
    expect(html).toContain("Harika bir dönem.");
    expect(html).toContain("Bu karne, koçun onayladığı tarihteki verileri gösterir.");
  });
});

describe("every entry point goes through the shared loader and prop builder", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const entries = {
    student: "app/student/deneme-analizleri/karne/page.tsx",
    parent: "app/parent/karne/page.tsx",
    coachAction: "app/coach/students/[id]/karne-summary-actions.ts",
  };

  it("student and parent pages load with loadKarneSummary and render <KarneDocument {...karneDocumentProps(...)} />", () => {
    for (const file of [entries.student, entries.parent]) {
      const src = read(file);
      expect(src, file).toContain("loadKarneSummary(");
      expect(src, file).toContain("karneDocumentProps(");
      expect(src, file).toContain("<KarneDocument");
      expect(src, file).not.toMatch(/fetchKarneSummary\(/);
    }
  });
  it("the coach's preview loads with the same loader and builds its props the same way", () => {
    expect(read(entries.coachAction)).toContain("loadKarneSummary(");
    expect(read(entries.coachAction)).not.toMatch(/\bfetchKarneSummary\(/);
    const live = read("app/coach/students/[id]/_components/karne-live-section.tsx");
    expect(live).toContain("karneDocumentProps(");
    expect(live).toContain("<KarneDocument");
  });
  it("approval stores the snapshot with the same computation the live Karne uses", () => {
    expect(read("app/coach/actions.ts")).toContain("fetchKarneSummary(supabase, existing.student_id, existing.range_start, existing.range_end)");
  });
  it("the old detailed report-card pages no longer render anything of their own: they send you to the unified Karne", () => {
    const student = read("app/student/deneme-analizleri/karne/[id]/page.tsx");
    const parent = read("app/parent/karne/[id]/page.tsx");
    expect(student).toContain("redirect(");
    expect(student).not.toContain("KarneDetailClient");
    expect(parent).toContain("redirect(");
    expect(parent).not.toContain("KarneDetailClient");
    expect(parent).toContain("/parent/karne?card=");
  });
  it("the Karnelerim tab is offered to every student, not only the 11th grade", () => {
    const layout = read("app/student/deneme-analizleri/layout.tsx");
    expect(layout).toMatch(/t\.href\.endsWith\("\/karne"\)\s*\|\|/);
    expect(layout).not.toMatch(/grade === 11 && \(t\.href\.endsWith\("\/gelisim-haritasi"\) \|\| t\.href\.endsWith\("\/karne"\)\)/);
  });
});

