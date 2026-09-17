import { describe, expect, it } from "vitest";
import {
  computeAytScoreBreakdown,
  computeNetSummary,
  computeTotalDurationMinutes,
  computeTytScoreBreakdown,
  inclusiveDaySpan,
  nextCycleRange,
  type KarneGeneralExam,
  type KarneScoreTask,
} from "./karne";

describe("inclusiveDaySpan", () => {
  it("counts a same-day range as 1, not 0", () => {
    expect(inclusiveDaySpan("2026-01-01", "2026-01-01")).toBe(1);
  });

  it("matches nextCycleRange's own 28-day-inclusive convention exactly", () => {
    const { rangeStart, rangeEnd } = nextCycleRange("2026-01-01", null);
    expect(inclusiveDaySpan(rangeStart, rangeEnd)).toBe(28);
  });

  it("counts correctly across a month boundary", () => {
    expect(inclusiveDaySpan("2026-01-20", "2026-02-05")).toBe(17);
  });
});

describe("computeTytScoreBreakdown", () => {
  const RANGE_START = "2026-01-01";
  const RANGE_END = "2026-01-28";

  it("sums course_id-tagged practice rows into their TYT subject group, merging sibling courses (matematik + geometri)", () => {
    const tasks: KarneScoreTask[] = [
      { task_date: "2026-01-05", course_id: "tyt-matematik", correct_count: 30, wrong_count: 5, empty_count: 5 },
      { task_date: "2026-01-10", course_id: "tyt-geometri", correct_count: 10, wrong_count: 2, empty_count: 3 },
      { task_date: "2026-01-15", course_id: "tyt-turkce", correct_count: 20, wrong_count: 1, empty_count: 0 },
    ];
    const result = computeTytScoreBreakdown(tasks, [], RANGE_START, RANGE_END);
    const matematik = result.bySubject.find((r) => r.key === "matematik")!;
    expect(matematik).toMatchObject({ correct: 40, wrong: 7, empty: 8 });
    const turkce = result.bySubject.find((r) => r.key === "turkce")!;
    expect(turkce).toMatchObject({ correct: 20, wrong: 1, empty: 0 });
  });

  it("sums TYT general_exam subject_scores into the matching group", () => {
    const exams: KarneGeneralExam[] = [
      { task_date: "2026-01-05", title: "TYT Genel Deneme - 345", subject_scores: { turkce: { correct: 30, wrong: 4, empty: 6 } } },
    ];
    const result = computeTytScoreBreakdown([], exams, RANGE_START, RANGE_END);
    const turkce = result.bySubject.find((r) => r.key === "turkce")!;
    expect(turkce).toMatchObject({ correct: 30, wrong: 4, empty: 6 });
  });

  it("combines practice rows and general_exam scores into one grand total", () => {
    const tasks: KarneScoreTask[] = [{ task_date: "2026-01-05", course_id: "tyt-fizik", correct_count: 10, wrong_count: 2, empty_count: 3 }];
    const exams: KarneGeneralExam[] = [
      { task_date: "2026-01-10", title: "TYT Genel Deneme - 128", subject_scores: { fen: { correct: 15, wrong: 3, empty: 2 } } },
    ];
    const result = computeTytScoreBreakdown(tasks, exams, RANGE_START, RANGE_END);
    expect(result.total).toEqual({ correct: 25, wrong: 5, empty: 5 });
  });

  it("excludes AYT course_id-tagged rows and AYT general exams entirely", () => {
    const tasks: KarneScoreTask[] = [
      { task_date: "2026-01-05", course_id: "ayt-matematik-sayisal", correct_count: 40, wrong_count: 0, empty_count: 0 },
    ];
    const exams: KarneGeneralExam[] = [
      { task_date: "2026-01-05", title: "AYT Genel Deneme - 345", subject_scores: { ayt_matematik: { correct: 20, wrong: 8, empty: 2 } } },
    ];
    const result = computeTytScoreBreakdown(tasks, exams, RANGE_START, RANGE_END);
    expect(result.total).toEqual({ correct: 0, wrong: 0, empty: 0 });
  });

  it("excludes rows and exams outside the range", () => {
    const tasks: KarneScoreTask[] = [
      { task_date: "2025-12-31", course_id: "tyt-matematik", correct_count: 40, wrong_count: 0, empty_count: 0 },
      { task_date: "2026-01-29", course_id: "tyt-matematik", correct_count: 40, wrong_count: 0, empty_count: 0 },
    ];
    const result = computeTytScoreBreakdown(tasks, [], RANGE_START, RANGE_END);
    expect(result.total).toEqual({ correct: 0, wrong: 0, empty: 0 });
  });

  it("always returns all 4 TYT subject groups, zero-filled when there's no data at all", () => {
    const result = computeTytScoreBreakdown([], [], RANGE_START, RANGE_END);
    expect(result.total).toEqual({ correct: 0, wrong: 0, empty: 0 });
    expect(result.bySubject.map((r) => r.key).sort()).toEqual(["fen", "matematik", "sosyal", "turkce"]);
    expect(result.bySubject.every((r) => r.correct === 0 && r.wrong === 0 && r.empty === 0)).toBe(true);
  });
});

describe("computeAytScoreBreakdown", () => {
  const RANGE_START = "2026-01-01";
  const RANGE_END = "2026-01-28";

  it("sums course_id-tagged practice rows into their AYT track+subject group", () => {
    const tasks: KarneScoreTask[] = [
      { task_date: "2026-01-05", course_id: "ayt-matematik-sayisal", correct_count: 30, wrong_count: 5, empty_count: 5 },
      { task_date: "2026-01-10", course_id: "ayt-geometri-sayisal", correct_count: 10, wrong_count: 2, empty_count: 3 },
      { task_date: "2026-01-15", course_id: "ayt-fizik", correct_count: 20, wrong_count: 1, empty_count: 0 },
    ];
    const result = computeAytScoreBreakdown(tasks, [], RANGE_START, RANGE_END);
    expect(result).toHaveLength(1);
    expect(result[0].track).toBe("sayisal");
    const matematik = result[0].bySubject.find((r) => r.key === "ayt_matematik")!;
    expect(matematik).toMatchObject({ correct: 40, wrong: 7, empty: 8 });
    const fizik = result[0].bySubject.find((r) => r.key === "ayt_fizik")!;
    expect(fizik).toMatchObject({ correct: 20, wrong: 1, empty: 0 });
  });

  it("infers the track from a general_exam's subject_scores keys and sums into that track's groups", () => {
    const exams: KarneGeneralExam[] = [
      {
        task_date: "2026-01-05",
        title: "AYT Genel Deneme - 345",
        subject_scores: { ayt_matematik: { correct: 20, wrong: 8, empty: 2 }, ayt_fizik: { correct: 10, wrong: 2, empty: 1 } },
      },
    ];
    const result = computeAytScoreBreakdown([], exams, RANGE_START, RANGE_END);
    expect(result).toHaveLength(1);
    expect(result[0].track).toBe("sayisal");
    expect(result[0].total).toEqual({ correct: 30, wrong: 10, empty: 3 });
  });

  it("keeps EA and Sözel separate even though they share a group label (Türk Dili ve Edebiyatı - Sosyal Bilimler 1)", () => {
    const tasks: KarneScoreTask[] = [
      { task_date: "2026-01-05", course_id: "ayt-edebiyat-ea", correct_count: 10, wrong_count: 0, empty_count: 0 },
      { task_date: "2026-01-06", course_id: "ayt-edebiyat-sozel", correct_count: 5, wrong_count: 0, empty_count: 0 },
    ];
    const result = computeAytScoreBreakdown(tasks, [], RANGE_START, RANGE_END);
    expect(result.map((r) => r.track).sort()).toEqual(["ea", "sozel"]);
    const eaGroup = result.find((r) => r.track === "ea")!.bySubject.find((r) => r.key === "ayt_ea_sozel1")!;
    expect(eaGroup.correct).toBe(10);
    const sozelGroup = result.find((r) => r.track === "sozel")!.bySubject.find((r) => r.key === "ayt_sozel_sozel1")!;
    expect(sozelGroup.correct).toBe(5);
  });

  it("excludes TYT course_id-tagged rows and TYT general exams entirely", () => {
    const tasks: KarneScoreTask[] = [{ task_date: "2026-01-05", course_id: "tyt-matematik", correct_count: 40, wrong_count: 0, empty_count: 0 }];
    const exams: KarneGeneralExam[] = [
      { task_date: "2026-01-05", title: "TYT Genel Deneme - 345", subject_scores: { matematik: { correct: 20, wrong: 8, empty: 2 } } },
    ];
    const result = computeAytScoreBreakdown(tasks, exams, RANGE_START, RANGE_END);
    expect(result).toEqual([]);
  });

  it("returns an empty array (not a zero-filled placeholder) when there's no AYT activity at all", () => {
    expect(computeAytScoreBreakdown([], [], RANGE_START, RANGE_END)).toEqual([]);
  });
});

describe("computeTotalDurationMinutes", () => {
  it("sums tracked_duration_minutes across every row, regardless of task type", () => {
    const rows = [{ tracked_duration_minutes: 60 }, { tracked_duration_minutes: 45 }, { tracked_duration_minutes: 30 }];
    expect(computeTotalDurationMinutes(rows)).toBe(135);
  });

  it("returns 0 for an empty list", () => {
    expect(computeTotalDurationMinutes([])).toBe(0);
  });
});

describe("nextCycleRange", () => {
  it("anchors the first cycle on the coaching start date, 28 days inclusive", () => {
    expect(nextCycleRange("2026-01-01", null)).toEqual({ rangeStart: "2026-01-01", rangeEnd: "2026-01-28" });
  });

  it("chains the next cycle starting the day after the previous one ends", () => {
    expect(nextCycleRange("2026-01-01", "2026-01-28")).toEqual({ rangeStart: "2026-01-29", rangeEnd: "2026-02-25" });
  });

  it("rolls a chained cycle across a month boundary correctly", () => {
    expect(nextCycleRange("2026-01-01", "2026-02-25")).toEqual({ rangeStart: "2026-02-26", rangeEnd: "2026-03-25" });
  });

  it("rolls across a year boundary correctly", () => {
    expect(nextCycleRange("2026-01-01", "2026-12-10")).toEqual({ rangeStart: "2026-12-11", rangeEnd: "2027-01-07" });
  });

  it("ignores coachingStartDate once a previous cycle exists (chains strictly off the prior cycle)", () => {
    const withPrev = nextCycleRange("2020-01-01", "2026-01-28");
    expect(withPrev.rangeStart).toBe("2026-01-29");
  });
});

describe("computeNetSummary", () => {
  const exams: KarneGeneralExam[] = [
    { task_date: "2026-01-05", title: "TYT Genel Deneme - 345", subject_scores: { turkce: { correct: 30, wrong: 4 } } },
    { task_date: "2026-01-15", title: "TYT Genel Deneme - 128", subject_scores: { turkce: { correct: 34, wrong: 0 } } },
    { task_date: "2026-01-20", title: "AYT Genel Deneme - 345", subject_scores: { matematik: { correct: 20, wrong: 8 } } },
    { task_date: "2026-02-05", title: "TYT Genel Deneme - 999", subject_scores: { turkce: { correct: 10, wrong: 0 } } },
  ];

  it("averages correct/wrong first, then nets once, within the given range", () => {
    // Two TYT exams in range: (30+34)/2=32 correct avg, (4+0)/2=2 wrong avg -> net(32,2) = 32 - 0.5 = 31.5
    const result = computeNetSummary(exams, "2026-01-01", "2026-01-31");
    expect(result.tyt).toBe(31.5);
    expect(result.ayt).toBe(computeNetOf(20, 8));
  });

  it("excludes exams outside the range", () => {
    const result = computeNetSummary(exams, "2026-01-01", "2026-01-31");
    // The Feb TYT exam (10 correct, 0 wrong) must not be included
    expect(result.tyt).not.toBe(computeNetOf((30 + 34 + 10) / 3, (4 + 0 + 0) / 3));
  });

  it("returns null for a track with zero exams in range", () => {
    const result = computeNetSummary(exams, "2026-03-01", "2026-03-28");
    expect(result.tyt).toBeNull();
    expect(result.ayt).toBeNull();
  });

  it("returns null (not NaN or 0) for an empty exam list", () => {
    expect(computeNetSummary([], "2026-01-01", "2026-01-31")).toEqual({ tyt: null, ayt: null });
  });
});

function computeNetOf(correct: number, wrong: number) {
  return Math.round((correct - wrong / 4) * 100) / 100;
}
