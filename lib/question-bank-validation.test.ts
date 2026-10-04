import { describe, expect, it } from "vitest";

import {
  checkQuestionBankSave,
  hasWatchedVideo,
  NO_QUESTIONS_NEEDS_VIDEO,
  NO_QUESTIONS_NOT_FOR_LGS,
  NO_QUESTIONS_WITH_COUNTS,
  QUESTION_COUNTS_REQUIRED,
} from "./question-bank-validation";

const base = { correct: null, wrong: null, empty: null, noQuestionsSolved: false, watchedVideo: false, isLgs: false };

describe("checkQuestionBankSave", () => {
  it("accepts any entered count; the others read as 0", () => {
    expect(checkQuestionBankSave({ ...base, correct: 10, wrong: 2, empty: 0 })).toBeNull();
    expect(checkQuestionBankSave({ ...base, correct: 10 })).toBeNull();
    expect(checkQuestionBankSave({ ...base, wrong: 0 })).toBeNull();
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
