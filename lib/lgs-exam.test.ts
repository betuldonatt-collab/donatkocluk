import { describe, expect, it } from "vitest";
import {
  LGS_QUESTION_TOTAL,
  computeLgsApproxScore,
  buildLgsExamHistory,
  computeLgsSubjectResult,
  lgsEmptyFor,
  normalizeLgsScores,
  summarizeLgsScores,
} from "./lgs-exam";

const PERFECT = {
  lgs_turkce: { correct: 20, wrong: 0, empty: 0 },
  lgs_inkilap: { correct: 10, wrong: 0, empty: 0 },
  lgs_din: { correct: 10, wrong: 0, empty: 0 },
  lgs_ingilizce: { correct: 10, wrong: 0, empty: 0 },
  lgs_matematik: { correct: 20, wrong: 0, empty: 0 },
  lgs_fen: { correct: 20, wrong: 0, empty: 0 },
};

describe("LGS structure", () => {
  it("is 90 questions: Türkçe 20, İnkılap 10, Din 10, İngilizce 10, Matematik 20, Fen 20", () => {
    expect(LGS_QUESTION_TOTAL).toBe(90);
  });
});

describe("lgsEmptyFor", () => {
  it("derives Boş from the subject's question count", () => {
    expect(lgsEmptyFor("lgs_turkce", 15, 3)).toBe(2);
    expect(lgsEmptyFor("lgs_din", 4, 2)).toBe(4);
  });

  it("stays null until both Doğru and Yanlış are known, and never goes negative", () => {
    expect(lgsEmptyFor("lgs_turkce", 15, null)).toBeNull();
    expect(lgsEmptyFor("lgs_turkce", null, 3)).toBeNull();
    expect(lgsEmptyFor("lgs_din", 8, 5)).toBe(0);
    expect(lgsEmptyFor("nope", 1, 1)).toBeNull();
  });
});

describe("computeLgsSubjectResult", () => {
  it("uses 3 yanlış = 1 doğru", () => {
    const r = computeLgsSubjectResult("lgs_matematik", 15, 3);
    expect(r).toMatchObject({ questions: 20, empty: 2, net: 14, overCap: false });
  });

  it("rounds a fractional net to 2 decimals", () => {
    expect(computeLgsSubjectResult("lgs_turkce", 10, 4)?.net).toBe(8.67);
  });

  it("flags Doğru + Yanlış above the question count", () => {
    expect(computeLgsSubjectResult("lgs_din", 8, 5)?.overCap).toBe(true);
  });

  it("returns null for an unknown subject", () => {
    expect(computeLgsSubjectResult("lgs_x", 1, 1)).toBeNull();
  });
});

describe("computeLgsApproxScore", () => {
  it("is exactly 500 for a perfect exam and exactly 194 for a blank one", () => {
    const perfect = summarizeLgsScores(PERFECT)!;
    expect(perfect.approxScore).toBe(500);
    expect(computeLgsApproxScore({})).toBe(194);
    const blank = summarizeLgsScores(Object.fromEntries(Object.keys(PERFECT).map((k) => [k, { correct: 0, wrong: 0, empty: 0 }])))!;
    expect(blank.approxScore).toBe(194);
  });

  it("follows 194 + 306 * (weighted net / 270)", () => {
    // Half the questions right in every subject: weighted net 135 -> 194 + 153.
    const half = summarizeLgsScores({
      lgs_turkce: { correct: 10, wrong: 0 },
      lgs_inkilap: { correct: 5, wrong: 0 },
      lgs_din: { correct: 5, wrong: 0 },
      lgs_ingilizce: { correct: 5, wrong: 0 },
      lgs_matematik: { correct: 10, wrong: 0 },
      lgs_fen: { correct: 10, wrong: 0 },
    })!;
    expect(half.approxScore).toBe(347);
    // One Matematik net (weight 4): 194 + 306 * 4 / 270.
    expect(computeLgsApproxScore({ lgs_matematik: 1 })).toBe(198.53);
    // One Din net (weight 1): 194 + 306 / 270.
    expect(computeLgsApproxScore({ lgs_din: 1 })).toBe(195.13);
  });

  it("weights Türkçe/Matematik/Fen four times the other subjects", () => {
    const fourWeighted = computeLgsApproxScore({ lgs_matematik: 1 });
    const oneWeighted = computeLgsApproxScore({ lgs_din: 1 });
    expect((fourWeighted - 194) / (oneWeighted - 194)).toBeCloseTo(4, 1);
  });

  it("never drops below 194 when wrong answers outweigh correct ones", () => {
    expect(computeLgsApproxScore({ lgs_turkce: -50 })).toBe(194);
  });
});

describe("summarizeLgsScores", () => {
  it("sums nets per session and overall", () => {
    const s = summarizeLgsScores({
      ...PERFECT,
      lgs_turkce: { correct: 17, wrong: 3, empty: 0 }, // 16
      lgs_matematik: { correct: 12, wrong: 6, empty: 2 }, // 10
    })!;
    expect(s.sozelNet).toBe(16 + 10 + 10 + 10);
    expect(s.sayisalNet).toBe(10 + 20);
    expect(s.totalNet).toBe(76);
  });

  it("returns null when a subject is missing or blank, or there are no scores", () => {
    expect(summarizeLgsScores(null)).toBeNull();
    const withoutFen = Object.fromEntries(Object.entries(PERFECT).filter(([k]) => k !== "lgs_fen"));
    expect(summarizeLgsScores(withoutFen)).toBeNull();
    expect(summarizeLgsScores({ ...PERFECT, lgs_fen: { correct: null, wrong: null, empty: null } })).toBeNull();
  });
});

describe("normalizeLgsScores", () => {
  it("derives Boş, ignores a client-sent one, and rolls up the flat totals", () => {
    const r = normalizeLgsScores({ ...PERFECT, lgs_turkce: { correct: 15, wrong: 3, empty: 99 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scores.lgs_turkce).toEqual({ correct: 15, wrong: 3, empty: 2 });
    expect(r.totals).toEqual({ total: 90, correct: 85, wrong: 3, empty: 2 });
  });

  it("rejects a missing or blank subject", () => {
    const withoutFen = Object.fromEntries(Object.entries(PERFECT).filter(([k]) => k !== "lgs_fen"));
    expect(normalizeLgsScores(withoutFen).ok).toBe(false);
    expect(normalizeLgsScores({ ...PERFECT, lgs_fen: { correct: 5, wrong: null } }).ok).toBe(false);
    expect(normalizeLgsScores(null).ok).toBe(false);
  });

  it("rejects Doğru + Yanlış above the subject's question count, naming the subject", () => {
    const r = normalizeLgsScores({ ...PERFECT, lgs_din: { correct: 8, wrong: 5 } });
    expect(r).toEqual({ ok: false, error: "Din Kültürü için Doğru + Yanlış en fazla 10 olabilir." });
  });

  it("accepts an unsolved subject entered as 0/0", () => {
    const r = normalizeLgsScores({ ...PERFECT, lgs_fen: { correct: 0, wrong: 0 } });
    expect(r.ok && r.scores.lgs_fen).toEqual({ correct: 0, wrong: 0, empty: 20 });
  });
});

describe("buildLgsExamHistory", () => {
  it("keeps only finished LGS exams, newest first", () => {
    const history = buildLgsExamHistory([
      { id: "a", task_date: "2026-09-01", title: "LGS Genel Deneme", subject_scores: PERFECT },
      { id: "b", task_date: "2026-09-15", title: "LGS Genel Deneme - Özdebir", subject_scores: PERFECT },
      { id: "c", task_date: "2026-09-20", title: "LGS Genel Deneme", subject_scores: null }, // no result yet
      { id: "d", task_date: "2026-09-21", title: "TYT Genel Deneme", subject_scores: PERFECT }, // other cohort
    ]);
    expect(history.map((h) => h.id)).toEqual(["b", "a"]);
    expect(history[0].summary.approxScore).toBe(500);
  });
});
