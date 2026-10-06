// Soru Çözümü (question_bank) save rules, shared by the student's task modal
// (checked before Kaydet is even sent) and updateTaskProgress (the
// authoritative check), so the message a student sees never differs from
// what a forged or stale client would get back.
//
// A Soru Çözümü task normally records Doğru / Yanlış / Boş. A student who only
// WATCHED the video solutions has none to enter, so they tick "Soruları çözmedim"
// instead: that saves the task with the three counts empty, as "Yarım
// Yapıldı" (video done, questions not). Branş Denemesi and Genel Deneme never
// get this bypass -- their Doğru/Yanlış/Boş stay mandatory
// (lib/exam-results-validation.ts). Toplam is the coach's target and is not an
// entry the student makes, so it plays no part here.

import { findCourseById } from "./curriculum";

export const QUESTION_COUNTS_REQUIRED =
  "Doğru, yanlış ve boş sayılarını gir. Soruları çözmediysen “Soruları çözmedim” kutusunu işaretle.";

// Doğru is the one box that must always be typed (0 is a number); Yanlış and Boş left blank simply count as 0.
export const QUESTION_CORRECT_REQUIRED = "Doğru kutusunu doldurman gerekiyor. Hiç doğrun yoksa 0 yaz.";

export const NO_QUESTIONS_NEEDS_VIDEO =
  "“Soruları çözmedim” seçeneği için en az bir videoyu izlendi olarak işaretlemelisin. Hiçbir şey yapmadıysan “Yapılmadı”yı seç.";

export const NO_QUESTIONS_WITH_COUNTS =
  "“Soruları çözmedim” işaretliyken doğru, yanlış ve boş girilemez. Ya kutuyu kaldır ya da sayıları sil.";

export const NO_QUESTIONS_NOT_FOR_LGS =
  "Soru Çözümü görevini tamamlamak için doğru, yanlış ve boş sayılarını girmelisin.";

// Whether a Soru Çözümü is in Matematik or Geometri, any cohort (TYT / AYT / LGS / 7th-10th grade ...): decided by the
// course's name, so every course called "... Matematik" or "... Geometri" counts and nothing else does (Problem and
// Yeni Nesil Mat Dozu are routines, not these subjects). It is the one case where a duration-only task ("Soru Çözümü
// · 60 dk", no question target) asks for Doğru; in every other subject its counts stay optional.
export function isMathOrGeometryCourse(courseId: string | null | undefined): boolean {
  const name = findCourseById(courseId)?.name;
  return name ? /matematik|geometri/i.test(name) : false;
}

// Whether a duration-only Soru Çözümü has to carry Doğru: in Matematik / Geometri, unless the student is reporting
// the task as not done ("Yapılmadı" needs no counts). Shared by the task modal and updateTaskProgress.
export function durationOnlyCountsRequired(input: { courseId: string | null | undefined; status: string | null | undefined }): boolean {
  return input.status !== "not_done" && isMathOrGeometryCourse(input.courseId);
}

export type QuestionBankSaveInput = {
  correct: number | null;
  wrong: number | null;
  empty: number | null;
  // The "Soruları çözmedim" box.
  noQuestionsSolved: boolean;
  // At least one of the task's video links is marked watched.
  watchedVideo: boolean;
  isLgs: boolean;
  // The form has no "Soruları çözmedim" box (a duration-only target), whatever the cohort.
  noBox?: boolean;
};

// A Soru Çözümü result with at least one count typed: the boxes left blank are saved as 0, so Doğru / Yanlış / Boş
// are always all numbers (the LGS / 7th-grade completion rules need all three). All blank stays all blank.
export function zeroFillQuestionCounts<T extends { correct: number | null; wrong: number | null; empty: number | null }>(counts: T): T {
  if (counts.correct === null && counts.wrong === null && counts.empty === null) return counts;
  return { ...counts, correct: counts.correct ?? 0, wrong: counts.wrong ?? 0, empty: counts.empty ?? 0 };
}

// null = fine to save; otherwise the Turkish reason it is refused.
export function checkQuestionBankSave(input: QuestionBankSaveInput): string | null {
  const anyCount = input.correct !== null || input.wrong !== null || input.empty !== null;
  if (input.noQuestionsSolved) {
    if (input.isLgs || input.noBox) return NO_QUESTIONS_NOT_FOR_LGS;
    if (anyCount) return NO_QUESTIONS_WITH_COUNTS;
    if (!input.watchedVideo) return NO_QUESTIONS_NEEDS_VIDEO;
    return null;
  }
  // Doğru must be typed (0 is a number). Yanlış and Boş left blank count as 0 (the caller writes the zeros -- see
  // zeroFillQuestionCounts), whatever the total. Fewer than the target is "Yarım Yapıldı", the target or more
  // "Yapıldı" (computeAutoTaskStatus).
  if (input.correct !== null) return null;
  // Yanlış / Boş typed but Doğru blank: ask for Doğru, and say what to write.
  if (anyCount) return QUESTION_CORRECT_REQUIRED;
  // Nothing typed at all: the box is the way out where it exists (every cohort but LGS / 7th grade, whose
  // completion rules need the counts), so only there does the message point at it.
  return input.isLgs || input.noBox ? NO_QUESTIONS_NOT_FOR_LGS : QUESTION_COUNTS_REQUIRED;
}

export function hasWatchedVideo(links: { watched?: boolean }[] | null | undefined): boolean {
  return (links ?? []).some((l) => l.watched === true);
}
