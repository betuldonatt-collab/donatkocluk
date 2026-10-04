import { describe, expect, it } from "vitest";
import { computeGelisimHaritasi, heatTier } from "./gelisim-haritasi";

const COURSE_ID = "tyt-turkce";
const TOPIC_ID = "tyt-turkce-u0-t0";

describe("heatTier", () => {
  it("is cool when there are zero mistakes, regardless of window size", () => {
    expect(heatTier(0, 8)).toBe("cool");
    expect(heatTier(0, 1)).toBe("cool");
  });

  it("is hot at exactly the 40% threshold", () => {
    expect(heatTier(4, 10)).toBe("hot"); // exactly 40%, boundary is inclusive
  });

  it("is warm just under the 40% threshold", () => {
    expect(heatTier(3, 10)).toBe("warm"); // 30%
  });

  it("is hot when every trial in the window was a mistake", () => {
    expect(heatTier(8, 8)).toBe("hot");
  });

  it("falls back to warm for a degenerate zero-size window with mistakes", () => {
    expect(heatTier(1, 0)).toBe("warm");
  });
});

describe("computeGelisimHaritasi", () => {
  function row(rows: ReturnType<typeof computeGelisimHaritasi>) {
    return rows.find((r) => r.courseId === COURSE_ID && r.topicId === TOPIC_ID)!;
  }

  it("splits mistakes into wrongCount and blankCount within the window", () => {
    const exams = [
      { id: "e1", task_date: "2026-01-04", task_type: "branch_exam", course_id: COURSE_ID },
      { id: "e2", task_date: "2026-01-03", task_type: "branch_exam", course_id: COURSE_ID },
      { id: "e3", task_date: "2026-01-02", task_type: "branch_exam", course_id: COURSE_ID },
    ];
    const mistakeRows = [
      { task_id: "e1", course_id: COURSE_ID, topic_id: TOPIC_ID, status: "wrong" as const },
      { task_id: "e2", course_id: COURSE_ID, topic_id: TOPIC_ID, status: "blank" as const },
    ];

    const r = row(computeGelisimHaritasi([COURSE_ID], exams, mistakeRows));
    expect(r.wrongCount).toBe(1);
    expect(r.blankCount).toBe(1);
    expect(r.count).toBe(2);
    expect(r.windowSize).toBe(3);
  });

  it("a topic marked BOTH Yanlış and Boş in one trial counts once for that trial, and credits both flags", () => {
    const exams = [
      { id: "e1", task_date: "2026-01-04", task_type: "branch_exam", course_id: COURSE_ID },
      { id: "e2", task_date: "2026-01-03", task_type: "branch_exam", course_id: COURSE_ID },
    ];
    const mistakeRows = [
      { task_id: "e1", course_id: COURSE_ID, topic_id: TOPIC_ID, status: "wrong" as const },
      { task_id: "e1", course_id: COURSE_ID, topic_id: TOPIC_ID, status: "blank" as const },
      { task_id: "e2", course_id: COURSE_ID, topic_id: TOPIC_ID, status: "wrong" as const },
    ];

    const r = row(computeGelisimHaritasi([COURSE_ID], exams, mistakeRows));
    expect(r.wrongCount).toBe(2);
    expect(r.blankCount).toBe(1);
    // Two trials had a mistake on this topic -- not three marks.
    expect(r.count).toBe(2);
    expect(r.windowSize).toBe(2);
    expect(heatTier(r.count, r.windowSize)).toBe("hot");
  });

  it("two rows with the same status for one topic and trial are not double counted", () => {
    const exams = [{ id: "e1", task_date: "2026-01-04", task_type: "branch_exam", course_id: COURSE_ID }];
    const dup = { task_id: "e1", course_id: COURSE_ID, topic_id: TOPIC_ID, status: "wrong" as const };
    expect(row(computeGelisimHaritasi([COURSE_ID], exams, [dup, dup])).count).toBe(1);
  });

  it("treats a missing status as wrong, for callers that don't select it", () => {
    const exams = [{ id: "e1", task_date: "2026-01-04", task_type: "branch_exam", course_id: COURSE_ID }];
    const mistakeRows = [{ task_id: "e1", course_id: COURSE_ID, topic_id: TOPIC_ID }];

    const r = row(computeGelisimHaritasi([COURSE_ID], exams, mistakeRows));
    expect(r.wrongCount).toBe(1);
    expect(r.blankCount).toBe(0);
  });

  it("reports a zero windowSize and zero counts when there are no relevant trials", () => {
    const r = row(computeGelisimHaritasi([COURSE_ID], [], []));
    expect(r.windowSize).toBe(0);
    expect(r.wrongCount).toBe(0);
    expect(r.blankCount).toBe(0);
  });

  it("rolls up an LGS course's rows to Konu level, folding mistakes tagged on any of its Alt Konu members", () => {
    const LGS_COURSE_ID = "lgs-matematik";
    // "EKOK" and "EBOB" are both members of the "Çarpanlar ve Katlar"
    // node (lgs-matematik-u0-t0) alongside its representative topic.
    const exams = [{ id: "e1", task_date: "2026-01-04", task_type: "branch_exam", course_id: LGS_COURSE_ID }];
    const mistakeRows = [
      { task_id: "e1", course_id: LGS_COURSE_ID, topic_id: "lgs-matematik-u0-t1", status: "wrong" as const }, // EKOK
      { task_id: "e1", course_id: LGS_COURSE_ID, topic_id: "lgs-matematik-u0-t2", status: "blank" as const }, // EBOB
    ];

    const rows = computeGelisimHaritasi([LGS_COURSE_ID], exams, mistakeRows);
    // One row for the whole Konu, not one per Alt Konu.
    expect(rows.filter((r) => r.courseId === LGS_COURSE_ID)).toHaveLength(12);
    const carpanlarVeKatlar = rows.find((r) => r.topicId === "lgs-matematik-u0-t0")!;
    expect(carpanlarVeKatlar.topicName).toBe("Çarpanlar ve Katlar");
    expect(carpanlarVeKatlar.wrongCount).toBe(1);
    expect(carpanlarVeKatlar.blankCount).toBe(1);
  });
});
