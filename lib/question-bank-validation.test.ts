import { describe, expect, it } from "vitest";

import {
  checkQuestionBankSave,
  hasWatchedVideo,
  NO_QUESTIONS_NEEDS_VIDEO,
  NO_QUESTIONS_NOT_FOR_LGS,
  NO_QUESTIONS_WITH_COUNTS,
  QUESTION_COUNTS_REQUIRED,
  zeroFillQuestionCounts,
} from "./question-bank-validation";

const base = { correct: null, wrong: null, empty: null, noQuestionsSolved: false, watchedVideo: false, isLgs: false };

describe("checkQuestionBankSave", () => {
  it("accepts any typed count, whatever the assigned total (fewer or more); a blank box is a 0", () => {
    expect(checkQuestionBankSave({ ...base, correct: 10, wrong: 2, empty: 0 })).toBeNull();
    expect(checkQuestionBankSave({ ...base, correct: 50, wrong: 10, empty: 0 })).toBeNull(); // 60 of a 100 target: Yarım Yapıldı
    expect(checkQuestionBankSave({ ...base, correct: 90, wrong: 20, empty: 5 })).toBeNull(); // 115 of 100: exceeding is fine
    for (const partial of [{ correct: 10 }, { wrong: 0 }, { empty: 3 }, { correct: 10, wrong: 2 }, { wrong: 2, empty: 0 }]) {
      expect(checkQuestionBankSave({ ...base, ...partial })).toBeNull();
    }
  });

  it("zeroFillQuestionCounts writes the zeros for the blank boxes once any count is typed", () => {
    expect(zeroFillQuestionCounts({ correct: 50, wrong: null, empty: null })).toEqual({ correct: 50, wrong: 0, empty: 0 });
    expect(zeroFillQuestionCounts({ correct: null, wrong: 4, empty: null })).toEqual({ correct: 0, wrong: 4, empty: 0 });
    expect(zeroFillQuestionCounts({ correct: 50, wrong: 10, empty: 2 })).toEqual({ correct: 50, wrong: 10, empty: 2 });
  });

  it("zeroFillQuestionCounts leaves an entirely blank result blank (nothing was entered)", () => {
    expect(zeroFillQuestionCounts({ correct: null, wrong: null, empty: null })).toEqual({ correct: null, wrong: null, empty: null });
  });

  it("with no counts and the box unticked, asks for the counts or the box", () => {
    expect(checkQuestionBankSave(base)).toBe(QUESTION_COUNTS_REQUIRED);
    expect(checkQuestionBankSave({ ...base, watchedVideo: true })).toBe(QUESTION_COUNTS_REQUIRED);
    expect(QUESTION_COUNTS_REQUIRED).toContain("Soruları çözmedim");
  });

  it("video-only: the box plus a watched video saves with the counts empty", () => {
    expect(checkQuestionBankSave({ ...base, noQuestionsSolved: true, watchedVideo: true })).toBeNull();
  });

  it("the box without any watched video is refused (use Yapılmadı instead)", () => {
    expect(checkQuestionBankSave({ ...base, noQuestionsSolved: true })).toBe(NO_QUESTIONS_NEEDS_VIDEO);
  });

  it("the box together with counts is contradictory", () => {
    expect(checkQuestionBankSave({ ...base, noQuestionsSolved: true, watchedVideo: true, correct: 3 })).toBe(NO_QUESTIONS_WITH_COUNTS);
    expect(checkQuestionBankSave({ ...base, noQuestionsSolved: true, watchedVideo: true, empty: 0 })).toBe(NO_QUESTIONS_WITH_COUNTS);
  });

  it("for LGS / 7th grade (no box) an entirely blank form is refused with the plain 'enter the counts' message", () => {
    expect(checkQuestionBankSave({ ...base, isLgs: true })).toBe(NO_QUESTIONS_NOT_FOR_LGS);
    expect(checkQuestionBankSave({ ...base, isLgs: true, wrong: 1 })).toBeNull();
  });

  it("LGS never gets the bypass", () => {
    expect(checkQuestionBankSave({ ...base, noQuestionsSolved: true, watchedVideo: true, isLgs: true })).toBe(NO_QUESTIONS_NOT_FOR_LGS);
  });
});

describe("hasWatchedVideo", () => {
  it("is true only when some link is marked watched", () => {
    expect(hasWatchedVideo([{ watched: false }, { watched: true }])).toBe(true);
    expect(hasWatchedVideo([{ watched: false }, {}])).toBe(false);
    expect(hasWatchedVideo([])).toBe(false);
    expect(hasWatchedVideo(null)).toBe(false);
  });
});
