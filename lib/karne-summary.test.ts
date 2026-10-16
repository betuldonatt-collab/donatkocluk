import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("./maarif-grade", () => ({ fetchMaarifGrade: async () => null }));

import { buildParentEventAttendance } from "./event-attendance";
import {
  computeKarneSummary,
  deltaOf,
  formatStudyTime,
  inclusiveDays,
  previousWindow,
  studyTimeSentence,
  summaryDataStart,
  type KarneSummaryTask,
} from "./karne-summary";
import { fetchKarneSummary } from "./karne-summary-data";
import { computeLgsNet, computeNet } from "./scoring";

// 2026-10-01 .. 2026-10-28 (28 days); the previous period is 2026-09-03 .. 2026-09-30; "today" is the day after the period.
const RANGE = { start: "2026-10-01", end: "2026-10-28" };
const TODAY = "2026-10-29";
const NOW = "2026-10-29T08:00:00.000Z";

const task = (t: Partial<KarneSummaryTask> & { task_date: string }): KarneSummaryTask => ({ status: "done", task_type: "question_bank", ...t });

const tasks: KarneSummaryTask[] = [
  // ---- the period ----
  task({ task_date: "2026-10-02", course_id: "tyt-matematik", total_count: 20, correct_count: 15, wrong_count: 3, empty_count: 2, tracked_duration_minutes: 40 }), // 400 units
  task({ task_date: "2026-10-03", task_type: "resource_review", course_id: "tyt-fizik", total_count: 10, correct_count: 6, wrong_count: 2, empty_count: 2, tracked_duration_minutes: 25 }), // 225
  task({ task_date: "2026-10-05", status: "pending", task_type: "video", course_id: "tyt-turkce", duration_minutes: 30 }), // 450, not done, no tracked time
  task({
    task_date: "2026-10-10",
    task_type: "general_exam",
    title: "TYT Genel Deneme 3",
    subject_scores: { turkce: { correct: 30, wrong: 5, empty: 5 }, matematik: { correct: 20, wrong: 10, empty: 10 } },
  }), // 1200
  task({
    task_date: "2026-10-17",
    task_type: "general_exam",
    title: "AYT Genel Deneme 1",
    subject_scores: { ayt_matematik: { correct: 20, wrong: 8, empty: 12 }, ayt_fizik: { correct: 8, wrong: 3, empty: 3 } },
  }), // 1200
  // ---- the previous period ----
  task({ task_date: "2026-09-10", course_id: "tyt-matematik", total_count: 30, correct_count: 20, wrong_count: 6, empty_count: 4, tracked_duration_minutes: 60 }), // 600
  task({
    task_date: "2026-09-20",
    task_type: "general_exam",
    title: "TYT Genel Deneme 2",
    subject_scores: { turkce: { correct: 25, wrong: 10, empty: 5 } },
  }), // 1200
];

const attendanceEvents = buildParentEventAttendance({
  announcements: [
    { id: "e1", title: "Deneme Semineri", event_date: "2026-10-05" },
    { id: "e2", title: "Verimli Çalışma", event_date: "2026-10-12" },
  ],
  configs: [
    { announcement_id: "e1", session_count: 2 },
    { announcement_id: "e2", session_count: 1 },
  ],
  attendance: [
    { announcement_id: "e1", session_number: 1, status: "attended", marked_at: "2026-10-05T10:00:00Z" },
    { announcement_id: "e1", session_number: 2, status: "not_attended", marked_at: "2026-10-05T10:00:00Z" },
    { announcement_id: "e2", session_number: 1, status: "attended", marked_at: "2026-10-12T10:00:00Z" },
  ],
  rsvps: [{ announcement_id: "e1", response: "attending", decline_reason: null }],
  rangeStart: RANGE.start,
  rangeEnd: RANGE.end,
});

const summary = computeKarneSummary({ rangeStart: RANGE.start, rangeEnd: RANGE.end, today: TODAY, now: NOW, tasks, events: attendanceEvents });

describe("period arithmetic", () => {
  it("counts inclusive days and builds the previous period of equal length", () => {
    expect(inclusiveDays("2026-10-01", "2026-10-28")).toBe(28);
    expect(inclusiveDays("2026-10-05", "2026-10-05")).toBe(1);
    expect(inclusiveDays("2026-10-06", "2026-10-05")).toBe(0);
    expect(previousWindow("2026-10-01", "2026-10-28")).toEqual({ start: "2026-09-03", end: "2026-09-30" });
    expect(previousWindow("2026-10-05", "2026-10-05")).toEqual({ start: "2026-10-04", end: "2026-10-04" });
  });

  it("the data window reaches back to whichever is earlier: the previous period or the trend's first week", () => {
    // 12 weeks back from the Monday of 2026-10-28 (2026-10-26) is 2026-08-10, earlier than the previous period's 2026-09-03
    expect(summaryDataStart("2026-10-01", "2026-10-28", TODAY, 12)).toBe("2026-08-10");
    // a long period: its previous period starts earlier than the trend does
    expect(summaryDataStart("2026-03-01", "2026-10-28", TODAY, 12)).toBe(previousWindow("2026-03-01", "2026-10-28").start);
  });
});

describe("the showcase numbers", () => {
  it("program completion is the effort-weighted share of done tasks, next to the previous period's", () => {
    // done 400 + 225 (resource review: 1.5x) + 1200 + 1200 = 3025 of 3025 + 450 pending video = 3475
    expect(summary.completion.pct).toBe(87);
    // previous: 600 + 1200 done of 1800
    expect(summary.completion.previousPct).toBe(100);
  });

  it("questions solved: Doğru / Yanlış / Boş of finished tasks, exams from their subject scores (nothing counted twice)", () => {
    // 20 + 10 + TYT exam 80 + AYT exam 54 = 164
    expect(summary.questions).toMatchObject({ total: 164, correct: 15 + 6 + 50 + 28, wrong: 3 + 2 + 15 + 11, empty: 2 + 2 + 15 + 15, previousTotal: 30 + 40 });
  });

  it("an unfinished task does not count as solved", () => {
    const s = computeKarneSummary({
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      today: TODAY,
      now: NOW,
      tasks: [task({ task_date: "2026-10-02", status: "pending", total_count: 20, correct_count: 10, wrong_count: 5, empty_count: 5 })],
      events: [],
    });
    expect(s.questions.total).toBe(0);
    // ...but a half-done one does
    const h = computeKarneSummary({
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      today: TODAY,
      now: NOW,
      tasks: [task({ task_date: "2026-10-02", status: "half_done", total_count: 20, correct_count: 10, wrong_count: 5, empty_count: 5 })],
      events: [],
    });
    expect(h.questions.total).toBe(20);
  });

  it("study time is TRACKED (kronometre) minutes of the period, not assigned durations, with the previous period's", () => {
    // 40 + 25 tracked; the pending video's 30 assigned minutes are NOT study time
    expect(summary.studyTime).toEqual({ minutes: 65, previousMinutes: 60 });
  });

  it("consistency: days with tracked time or a finished task, out of the period's days so far", () => {
    // 2, 3, 10 and 17 October; the untracked pending task on the 5th does not make a day active
    expect(summary.consistency).toEqual({ activeDays: 4, totalDays: 28, previousActiveDays: 2, previousTotalDays: 28 });
  });

  it("days after today are not held against the student", () => {
    const s = computeKarneSummary({ rangeStart: "2026-10-01", rangeEnd: "2026-10-28", today: "2026-10-10", now: NOW, tasks, events: [] });
    expect(s.consistency.totalDays).toBe(10);
  });

  it("attendance: attended of RECORDED sessions; an unmarked session is not an absence", () => {
    expect(summary.attendance.attendedSessions).toBe(2);
    expect(summary.attendance.recordedSessions).toBe(3);
    expect(summary.attendance.ratePct).toBe(67);
    expect(summary.attendance.events).toHaveLength(2);
    const none = computeKarneSummary({ rangeStart: RANGE.start, rangeEnd: RANGE.end, today: TODAY, now: NOW, tasks: [], events: [] });
    expect(none.attendance).toEqual({ attendedSessions: 0, recordedSessions: 0, ratePct: null, events: [] });
  });
});

describe("questions by course (Ders bazında) -- courses only, never topics", () => {
  it("one row per course with Toplam / Doğru / Yanlış / Boş, largest first, and the rows add up to the grand total", () => {
    const rows = summary.questions.byCourse;
    expect(rows.map((r) => [r.label, r.total, r.correct, r.wrong, r.empty])).toEqual([
      ["Genel Deneme", 134, 78, 26, 30],
      ["TYT Matematik", 20, 15, 3, 2],
      ["TYT Fizik", 10, 6, 2, 2],
    ]);
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(summary.questions.total);
    expect(rows.reduce((n, r) => n + r.correct, 0)).toBe(summary.questions.correct);
    expect(rows.reduce((n, r) => n + r.wrong, 0)).toBe(summary.questions.wrong);
    expect(rows.reduce((n, r) => n + r.empty, 0)).toBe(summary.questions.empty);
  });

  it("a row is exactly a course: no topic information anywhere in it", () => {
    for (const row of summary.questions.byCourse) expect(Object.keys(row).sort()).toEqual(["correct", "empty", "key", "label", "total", "wrong"]);
    expect(JSON.stringify(summary.questions)).not.toMatch(/topic|konu/i);
  });

  it("practice on the same course in several tasks is one row; routine courses get readable names; no course is 'Diğer'", () => {
    const s = computeKarneSummary({
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      today: TODAY,
      now: NOW,
      tasks: [
        task({ task_date: "2026-10-02", course_id: "tyt-matematik", topic_id: "tyt-matematik-u0-t0", correct_count: 5, wrong_count: 1, empty_count: 0 } as never),
        task({ task_date: "2026-10-03", course_id: "tyt-matematik", topic_id: "tyt-matematik-u1-t0", correct_count: 7, wrong_count: 2, empty_count: 1 } as never),
        task({ task_date: "2026-10-04", course_id: "paragraf", correct_count: 9, wrong_count: 1, empty_count: 0 }),
        task({ task_date: "2026-10-05", course_id: null, correct_count: 2, wrong_count: 0, empty_count: 0 }),
        task({ task_date: "2026-10-06", course_id: "tyt-turkce", status: "pending", correct_count: 9, wrong_count: 9, empty_count: 9 }),
      ],
      events: [],
    });
    expect(s.questions.byCourse.map((r) => [r.label, r.total])).toEqual([
      ["TYT Matematik", 16],
      ["Paragraf", 10],
      ["Diğer", 2],
    ]);
  });

  it("an old (legacy) AYT course id is counted under the unified course", () => {
    const s = computeKarneSummary({
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      today: TODAY,
      now: NOW,
      tasks: [task({ task_date: "2026-10-02", course_id: "ayt-matematik-sayisal", correct_count: 4, wrong_count: 0, empty_count: 0 })],
      events: [],
    });
    expect(s.questions.byCourse.map((r) => [r.key, r.label])).toEqual([["ayt-matematik", "AYT Matematik"]]);
  });
});

describe("the momentum trend", () => {
  it("is 12 weekly points ending in the period's last week, the period's weeks flagged", () => {
    const weeks = summary.trend.weeks;
    expect(weeks).toHaveLength(12);
    expect(weeks[0].weekStart).toBe("2026-08-10");
    expect(weeks[11]).toMatchObject({ weekStart: "2026-10-26", weekEnd: "2026-11-01" });
    // 28 Sep .. 26 Oct overlap 1-28 October
    expect(weeks.filter((w) => w.inPeriod).map((w) => w.weekStart)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("each week's value is that week's weighted completion (null for a week with no tasks)", () => {
    const byStart = new Map(summary.trend.weeks.map((w) => [w.weekStart, w.pct]));
    expect(byStart.get("2026-09-28")).toBe(100); // 400 + 225 done, nothing else that week
    expect(byStart.get("2026-10-05")).toBe(73); // video 450 pending + TYT exam 1200 done -> 1200 / 1650
    expect(byStart.get("2026-10-19")).toBeNull();
  });

  it("a week that has not started yet is null, not 0", () => {
    const s = computeKarneSummary({ rangeStart: "2026-10-01", rangeEnd: "2026-11-15", today: "2026-10-20", now: NOW, tasks, events: [] });
    const last = s.trend.weeks[s.trend.weeks.length - 1];
    // the trend ends at "today's" week, never in the future
    expect(last.weekStart <= "2026-10-20").toBe(true);
  });
});

describe("the exam overview: high level only", () => {
  it("one group per kind of exam in the period, with each exam's net and its change against the previous exam", () => {
    const keys = summary.exams.groups.map((g) => g.key);
    expect(keys).toEqual(["tyt", "ayt:sayisal"]);
    const tyt = summary.exams.groups[0];
    expect(tyt.label).toBe("TYT Genel Deneme");
    expect(tyt.items).toEqual([{ date: "2026-10-10", title: "TYT Genel Deneme 3", net: computeNet(50, 15), deltaVsPrevious: Math.round((computeNet(50, 15) - computeNet(25, 10)) * 100) / 100 }]);
    expect(tyt.averageNet).toBe(computeNet(50, 15));
    expect(tyt.bestNet).toBe(computeNet(50, 15));
    // the previous period's exam
    expect(tyt.previousAverageNet).toBe(computeNet(25, 10));
  });

  it("main-branch averages only (no topics), and only the branches the exams actually have", () => {
    const tyt = summary.exams.groups[0];
    expect(tyt.branches).toEqual([
      { key: "turkce", label: expect.any(String), averageNet: computeNet(30, 5), questions: 40 },
      { key: "matematik", label: expect.any(String), averageNet: computeNet(20, 10), questions: 40 },
    ]);
  });

  it("AYT branch averages are included whenever the period has AYT exams, grouped by the AYT field the exam was taken in", () => {
    const ayt = summary.exams.groups[1];
    expect(ayt.label.startsWith("AYT Genel Deneme")).toBe(true);
    expect(ayt.items).toHaveLength(1);
    expect(ayt.items[0].deltaVsPrevious).toBeNull();
    expect(ayt.branches.map((b) => [b.key, b.averageNet])).toEqual([
      ["ayt_matematik", computeNet(20, 8)],
      ["ayt_fizik", computeNet(8, 3)],
    ]);
  });

  it("several exams: the net is averaged over the D/Y first, best and change are per exam", () => {
    const s = computeKarneSummary({
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      today: TODAY,
      now: NOW,
      tasks: [
        task({ task_date: "2026-10-05", task_type: "general_exam", title: "TYT Genel Deneme 1", subject_scores: { turkce: { correct: 30, wrong: 10, empty: 0 } } }),
        task({ task_date: "2026-10-19", task_type: "general_exam", title: "TYT Genel Deneme 2", subject_scores: { turkce: { correct: 36, wrong: 4, empty: 0 } } }),
      ],
      events: [],
    });
    const g = s.exams.groups[0];
    expect(g.items.map((i) => i.net)).toEqual([computeNet(30, 10), computeNet(36, 4)]);
    expect(g.items.map((i) => i.deltaVsPrevious)).toEqual([null, Math.round((computeNet(36, 4) - computeNet(30, 10)) * 100) / 100]);
    expect(g.averageNet).toBe(computeNet(33, 7));
    expect(g.bestNet).toBe(computeNet(36, 4));
  });

  it("LGS nets 3:1 and uses the six subjects; an LGS student's group is labelled LGS", () => {
    const s = computeKarneSummary({
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      today: TODAY,
      now: NOW,
      tasks: [task({ task_date: "2026-10-12", task_type: "general_exam", title: "LGS Genel Deneme 1", subject_scores: { lgs_matematik: { correct: 15, wrong: 6, empty: 0 } } })],
      events: [],
    });
    expect(s.exams.groups).toHaveLength(1);
    expect(s.exams.groups[0].key).toBe("lgs");
    expect(s.exams.groups[0].items[0].net).toBe(computeLgsNet(15, 6));
    expect(s.exams.groups[0].branches).toEqual([{ key: "lgs_matematik", label: expect.any(String), averageNet: computeLgsNet(15, 6), questions: 20 }]);
  });

  it("an 11th grader's TYT-structured exam carries its own name: Maarif TYT (also for a legacy '11. SINIF' title with TYT-shaped scores)", () => {
    const legacy = computeKarneSummary({
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      today: TODAY,
      now: NOW,
      tasks: [task({ task_date: "2026-10-12", task_type: "general_exam", title: "11. SINIF Genel Deneme - X", subject_scores: { turkce: { correct: 10, wrong: 2, empty: 0 } } })],
      events: [],
      maarifGrade: 11,
    });
    expect(legacy.exams.groups[0].label).toBe("Maarif TYT Genel Deneme");
    const s = computeKarneSummary({
      rangeStart: RANGE.start,
      rangeEnd: RANGE.end,
      today: TODAY,
      now: NOW,
      tasks: [task({ task_date: "2026-10-12", task_type: "general_exam", title: "Maarif TYT Genel Deneme - X", subject_scores: { turkce: { correct: 10, wrong: 2, empty: 0 } } })],
      events: [],
      maarifGrade: 11,
    });
    expect(s.exams.groups[0].label).toBe("Maarif TYT Genel Deneme");
    expect(s.exams.groups[0].key).toBe("mtyt");
  });

  it("no exam in the period: no groups (the document says so instead of showing zeros)", () => {
    const s = computeKarneSummary({ rangeStart: RANGE.start, rangeEnd: RANGE.end, today: TODAY, now: NOW, tasks: [task({ task_date: "2026-10-02", total_count: 5, correct_count: 5, wrong_count: 0, empty_count: 0 })], events: [] });
    expect(s.exams.groups).toEqual([]);
  });
});

describe("empty input and shape", () => {
  it("an empty period is all zeros / nulls, never NaN, and still has its 12 trend weeks", () => {
    const s = computeKarneSummary({ rangeStart: RANGE.start, rangeEnd: RANGE.end, today: TODAY, now: NOW, tasks: [], events: [] });
    expect(s.completion).toEqual({ pct: null, previousPct: null });
    expect(s.questions).toEqual({ total: 0, correct: 0, wrong: 0, empty: 0, previousTotal: 0, byCourse: [] });
    expect(s.studyTime).toEqual({ minutes: 0, previousMinutes: 0 });
    expect(s.consistency.activeDays).toBe(0);
    expect(s.trend.weeks).toHaveLength(12);
    expect(s.trend.weeks.every((w) => w.pct === null)).toBe(true);
  });

  it("is JSON-safe (it is stored as the parent's frozen snapshot) and versioned", () => {
    const roundTripped = JSON.parse(JSON.stringify(summary));
    expect(roundTripped).toEqual(summary);
    expect(summary.version).toBe(1);
    expect(summary.generatedAt).toBe(NOW);
    expect(summary.period).toEqual({ start: RANGE.start, end: RANGE.end, days: 28 });
    expect(summary.previousPeriod).toEqual({ start: "2026-09-03", end: "2026-09-30" });
  });
});

describe("presentation helpers", () => {
  it("formats study time and states, explicitly, that it is tracked time", () => {
    expect(formatStudyTime(35)).toBe("35 dk");
    expect(formatStudyTime(120)).toBe("2 sa");
    expect(formatStudyTime(2480)).toBe("41 sa 20 dk");
    expect(studyTimeSentence(2480)).toBe("Toplam 41 sa 20 dk kronometre ile çalıştı");
  });

  it("deltaOf compares only when both sides exist", () => {
    expect(deltaOf(72, 63)).toBe(9);
    expect(deltaOf(60, 63)).toBe(-3);
    expect(deltaOf(72, null)).toBeNull();
    expect(deltaOf(null, 63)).toBeNull();
  });
});

describe("fetchKarneSummary (the data layer)", () => {
  function fakeClient(rows: Record<string, unknown[]>) {
    const calls: { table: string; filters: [string, string, unknown][] }[] = [];
    return {
      calls,
      from(table: string) {
        const call = { table, filters: [] as [string, string, unknown][] };
        calls.push(call);
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "order", "range"]) b[m] = () => b;
        for (const m of ["gte", "lte", "or"]) {
          b[m] = (a: string, v?: unknown) => {
            call.filters.push([m, a, v]);
            return b;
          };
        }
        b.maybeSingle = async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null });
        b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null, count: (rows[table] ?? []).length });
        return b;
      },
    };
  }

  it("reads only coach-approved tasks, bounded to the data window, and returns the computed summary", async () => {
    const client = fakeClient({ student_tasks: tasks as unknown[], profiles: [{ academic_track: "sayisal" }] });
    const s = await fetchKarneSummary(client as never, "s1", RANGE.start, RANGE.end, { today: TODAY, now: NOW });
    const taskCall = client.calls.find((c) => c.table === "student_tasks")!;
    expect(taskCall.filters).toContainEqual(["or", "is_coach_assigned.eq.true,is_approved_by_coach.eq.true", undefined]);
    expect(taskCall.filters).toContainEqual(["gte", "task_date", summaryDataStart(RANGE.start, RANGE.end, TODAY)]);
    expect(taskCall.filters).toContainEqual(["lte", "task_date", RANGE.end]);
    expect(s.completion.pct).toBe(87);
    expect(s.studyTime.minutes).toBe(65);
  });
});

describe("migration 0136", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0136_report_card_executive_summary.sql", import.meta.url), "utf8");

  it("adds ONE jsonb column and no note columns (the coach's note stays in coach_notes)", () => {
    expect(sql).toContain("add column if not exists executive_summary jsonb");
    // statements only (the header comments talk about coach_notes)
    const code = sql
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("--"))
      .join(" ");
    expect(code.match(/add column/g)).toHaveLength(1);
    expect(code).not.toMatch(/coach_note/i);
  });

  it("a stored snapshot cannot be changed, but a first one can always be set", () => {
    expect(sql).toContain("old.executive_summary is not null");
    expect(sql).toContain("new.executive_summary is distinct from old.executive_summary");
    expect(sql).toContain("before update on public.student_report_cards");
  });
});
