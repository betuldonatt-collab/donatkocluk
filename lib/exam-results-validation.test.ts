import { describe, expect, it } from "vitest";
import {
  EXAM_SCORES_REQUIRED,
  GENERAL_EXAM_SCORES_REQUIRED,
  anyBlankScore,
  expectedGeneralExamKeys,
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
