import { describe, expect, it } from "vitest";
import {
  EXAM_SCORES_REQUIRED,
  GENERAL_EXAM_SCORES_REQUIRED,
  anyBlankScore,
  expectedGeneralExamKeys,
  findGeneralExamTotalMismatch,
  generalExamTotalMismatchMessage,
  isBlankScore,
  isGeneralExamScoresIncomplete,
} from "./exam-results-validation";

const row = { correct: 10, wrong: 2, empty: 1 };

describe("isBlankScore", () => {
  it("treats empty/whitespace strings, null and undefined as blank", () => {
    for (const v of ["", "  ", null, undefined]) expect(isBlankScore(v)).toBe(true);
  });

  it("never treats 0 (number or string) as blank", () => {
    expect(isBlankScore(0)).toBe(false);
    expect(isBlankScore("0")).toBe(false);
  });

  it("anyBlankScore flags a single empty box among filled ones", () => {
    expect(anyBlankScore(["3", "0", ""])).toBe(true);
    expect(anyBlankScore(["3", "0", "1"])).toBe(false);
  });
});

describe("expectedGeneralExamKeys", () => {
  it("LGS expects all six lgs_* subjects", () => {
    expect(expectedGeneralExamKeys("LGS Genel Deneme - X", null)).toHaveLength(6);
  });

  it("TYT expects its four groups", () => {
    expect(expectedGeneralExamKeys("TYT Genel Deneme", null)).toEqual(["turkce", "sosyal", "matematik", "fen"]);
  });

  it("AYT with no recognisable alan is undecidable", () => {
    expect(expectedGeneralExamKeys("AYT Genel Deneme", {})).toBeNull();
  });
});

describe("isGeneralExamScoresIncomplete", () => {
  const tyt = { turkce: row, sosyal: row, matematik: row, fen: row };

  it("accepts a fully filled TYT exam, zeros included", () => {
    expect(isGeneralExamScoresIncomplete("TYT Genel Deneme", tyt)).toBe(false);
    expect(
      isGeneralExamScoresIncomplete("TYT Genel Deneme", { ...tyt, fen: { correct: 0, wrong: 0, empty: 0 } }),
    ).toBe(false);
  });

  it("rejects a subject left blank (null)", () => {
    expect(isGeneralExamScoresIncomplete("TYT Genel Deneme", { ...tyt, fen: { correct: 4, wrong: null, empty: 2 } })).toBe(true);
  });

  it("rejects a subject that is missing altogether", () => {
    const { fen: _fen, ...withoutFen } = tyt;
    void _fen;
    expect(isGeneralExamScoresIncomplete("TYT Genel Deneme", withoutFen)).toBe(true);
  });

  it("rejects empty / null submissions", () => {
    expect(isGeneralExamScoresIncomplete("TYT Genel Deneme", {})).toBe(true);
    expect(isGeneralExamScoresIncomplete("TYT Genel Deneme", null)).toBe(true);
  });

  it("LGS needs all six subjects", () => {
    const five = { lgs_turkce: row, lgs_inkilap: row, lgs_din: row, lgs_ingilizce: row, lgs_matematik: row };
    expect(isGeneralExamScoresIncomplete("LGS Genel Deneme", five)).toBe(true);
    expect(isGeneralExamScoresIncomplete("LGS Genel Deneme", { ...five, lgs_fen: row })).toBe(false);
  });
});

describe("findGeneralExamTotalMismatch", () => {
  it("catches the exact reported bug: Türkçe summing to 42 instead of its fixed 40", () => {
    const scores = {
      turkce: { correct: 32, wrong: 2, empty: 8 },
      sosyal: { correct: 12, wrong: 2, empty: 6 },
      matematik: { correct: 20, wrong: 2, empty: 18 },
      fen: { correct: 13, wrong: 7, empty: 0 },
    };
    expect(findGeneralExamTotalMismatch("TYT Genel Deneme", scores)).toEqual({ label: "Türkçe", questions: 40 });
  });

  it("passes when every section's Doğru+Yanlış+Boş matches its fixed count", () => {
    const tyt = {
      turkce: { correct: 30, wrong: 5, empty: 5 },
      sosyal: { correct: 15, wrong: 2, empty: 3 },
      matematik: { correct: 35, wrong: 3, empty: 2 },
      fen: { correct: 18, wrong: 1, empty: 1 },
    };
    expect(findGeneralExamTotalMismatch("TYT Genel Deneme", tyt)).toBeNull();
  });

  it("skips a still-blank section rather than reporting a false mismatch", () => {
    expect(
      findGeneralExamTotalMismatch("TYT Genel Deneme", { turkce: { correct: 30, wrong: null, empty: null } }),
    ).toBeNull();
  });

  it("builds the subject-specific Turkish message", () => {
    expect(generalExamTotalMismatchMessage("Türkçe", 40)).toBe("Türkçe bölümü toplam 40 soru olmalıdır.");
  });
});

describe("messages", () => {
  it("the Genel Deneme message is the agreed Turkish text", () => {
    expect(GENERAL_EXAM_SCORES_REQUIRED).toBe(
      "Lütfen kaydetmek için tüm derslere ait doğru, yanlış ve boş kutucuklarını eksiksiz doldurunuz. Çözmediğiniz dersler için 0 yazabilirsiniz.",
    );
  });

  it("the single-set message mentions 0 for unsolved questions", () => {
    expect(EXAM_SCORES_REQUIRED).toContain("0 yazabilirsiniz");
  });
});
