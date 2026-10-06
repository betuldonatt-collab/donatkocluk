import { describe, expect, it } from "vitest";

import {
  checkQuestionBankSave,
  hasWatchedVideo,
  NO_QUESTIONS_NEEDS_VIDEO,
  NO_QUESTIONS_NOT_FOR_LGS,
  NO_QUESTIONS_WITH_COUNTS,
  QUESTION_CORRECT_REQUIRED,
  durationOnlyCountsRequired,
  isMathOrGeometryCourse,
  QUESTION_COUNTS_REQUIRED,
  zeroFillQuestionCounts,
} from "./question-bank-validation";

const base = { correct: null, wrong: null, empty: null, noQuestionsSolved: false, watchedVideo: false, isLgs: false };

describe("checkQuestionBankSave", () => {
  it("Doğru must be typed (0 is a number); a blank Yanlış or Boş is just a 0, with no error", () => {
    expect(checkQuestionBankSave({ ...base, correct: 0 })).toBeNull();
    expect(checkQuestionBankSave({ ...base, correct: 50 })).toBeNull();
    expect(checkQuestionBankSave({ ...base, correct: 50, wrong: 10 })).toBeNull();
    expect(checkQuestionBankSave({ ...base, correct: 50, empty: 3 })).toBeNull();
    for (const noCorrect of [{ wrong: 0 }, { empty: 3 }, { wrong: 2, empty: 0 }]) {
      expect(checkQuestionBankSave({ ...base, ...noCorrect })).toBe(QUESTION_CORRECT_REQUIRED);
    }
    expect(QUESTION_CORRECT_REQUIRED).toContain("Doğru");
    expect(QUESTION_CORRECT_REQUIRED).toContain("0 yaz");
  });

  it("accepts any typed Doğru, whatever the assigned total (fewer or more); the others default to 0", () => {
    expect(checkQuestionBankSave({ ...base, correct: 10, wrong: 2, empty: 0 })).toBeNull();
    expect(checkQuestionBankSave({ ...base, correct: 50, wrong: 10, empty: 0 })).toBeNull(); // 60 of a 100 target: Yarım Yapıldı
    expect(checkQuestionBankSave({ ...base, correct: 90, wrong: 20, empty: 5 })).toBeNull(); // 115 of 100: exceeding is fine
    for (const partial of [{ correct: 10 }, { correct: 10, wrong: 2 }, { correct: 0, empty: 4 }]) {
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
    expect(checkQuestionBankSave({ ...base, isLgs: true, wrong: 1 })).toBe(QUESTION_CORRECT_REQUIRED);
    expect(checkQuestionBankSave({ ...base, isLgs: true, correct: 1 })).toBeNull();
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

describe("duration-only Soru Çözümü: Doğru is required in Matematik / Geometri only", () => {
  it("recognises Matematik and Geometri courses of every cohort, and nothing else", async () => {
    const { MAARIF_GRADES } = await import("./maarif-grade");
    const mathGeo = ["tyt-matematik", "tyt-geometri", "lgs-matematik", "maarif7-matematik"];
    for (const id of mathGeo) expect(isMathOrGeometryCourse(id), id).toBe(true);
    // every course of the 7th-10th grades whose name says Matematik / Geometri is detected, the others are not
    for (const grade of [7, 9, 10] as const) {
      for (const course of MAARIF_GRADES[grade].courses) {
        expect(isMathOrGeometryCourse(course.id), course.name).toBe(/matematik|geometri/i.test(course.name));
      }
    }
    for (const id of ["tyt-fizik", "tyt-turkce", "tyt-kimya", "lgs-fen", "lgs-turkce", "maarif7-fen-bilimleri", "paragraf", "problem", "yeni-nesil-mat-dozu", "kitap-okuma"]) {
      expect(isMathOrGeometryCourse(id), id).toBe(false);
    }
    expect(isMathOrGeometryCourse(null)).toBe(false);
    expect(isMathOrGeometryCourse("no-such-course")).toBe(false);
  });

  it("every AYT Matematik / Geometri course (Sayısal and EA) counts too", async () => {
    const { AYT_COURSES_BY_TRACK } = await import("./curriculum");
    const all = [...AYT_COURSES_BY_TRACK.sayisal, ...AYT_COURSES_BY_TRACK.ea, ...AYT_COURSES_BY_TRACK.sozel];
    const math = all.filter((c) => /matematik|geometri/i.test(c.name));
    expect(math.length).toBeGreaterThan(0);
    for (const c of math) expect(isMathOrGeometryCourse(c.id), c.id).toBe(true);
  });

  it("requires Doğru for a math / geometry duration-only task, not for other subjects, and never for Yapılmadı", () => {
    expect(durationOnlyCountsRequired({ courseId: "tyt-matematik", status: "done" })).toBe(true);
    expect(durationOnlyCountsRequired({ courseId: "tyt-geometri", status: "half_done" })).toBe(true);
    expect(durationOnlyCountsRequired({ courseId: "tyt-matematik", status: null })).toBe(true);
    expect(durationOnlyCountsRequired({ courseId: "tyt-matematik", status: "not_done" })).toBe(false);
    expect(durationOnlyCountsRequired({ courseId: "tyt-fizik", status: "done" })).toBe(false);
    expect(durationOnlyCountsRequired({ courseId: "lgs-fen", status: "done" })).toBe(false);
  });

  it("when required, a blank Doğru gets the message (no mention of the missing 'Soruları çözmedim' box)", () => {
    const noBox = { ...base, noBox: true };
    expect(checkQuestionBankSave({ ...noBox, wrong: 2 })).toBe(QUESTION_CORRECT_REQUIRED);
    expect(checkQuestionBankSave(noBox)).not.toContain("Soruları çözmedim");
    expect(checkQuestionBankSave(noBox)).toBe(NO_QUESTIONS_NOT_FOR_LGS);
    expect(checkQuestionBankSave({ ...noBox, correct: 0 })).toBeNull();
    expect(checkQuestionBankSave({ ...noBox, correct: 12, wrong: 3 })).toBeNull();
  });
});

describe("Matematik / Geometri detection covers the 11th grade's merged Maarif TYT courses too", () => {
  it("each course whose name says Matematik or Geometri is detected", async () => {
    const { MAARIF_TYT_MERGED_COURSES } = await import("./curriculum/maarif-tyt");
    const { MAARIF_GRADES } = await import("./maarif-grade");
    for (const course of [...MAARIF_TYT_MERGED_COURSES, ...MAARIF_GRADES[11].courses]) {
      expect(isMathOrGeometryCourse(course.id), course.name).toBe(/matematik|geometri/i.test(course.name));
    }
  });
});
