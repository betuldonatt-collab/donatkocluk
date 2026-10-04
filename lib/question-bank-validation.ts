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

export const QUESTION_COUNTS_REQUIRED =
  "Doğru, yanlış ve boş sayılarını gir. Soruları çözmediysen “Soruları çözmedim” kutusunu işaretle.";

export const NO_QUESTIONS_NEEDS_VIDEO =
  "“Soruları çözmedim” seçeneği için en az bir videoyu izlendi olarak işaretlemelisin. Hiçbir şey yapmadıysan “Yapılmadı”yı seç.";

export const NO_QUESTIONS_WITH_COUNTS =
  "“Soruları çözmedim” işaretliyken doğru, yanlış ve boş girilemez. Ya kutuyu kaldır ya da sayıları sil.";

export const NO_QUESTIONS_NOT_FOR_LGS =
  "Soru Çözümü görevini tamamlamak için doğru, yanlış ve boş sayılarını girmelisin.";

export type QuestionBankSaveInput = {
  correct: number | null;
  wrong: number | null;
  empty: number | null;
  // The "Soruları çözmedim" box.
  noQuestionsSolved: boolean;
  // At least one of the task's video links is marked watched.
  watchedVideo: boolean;
  isLgs: boolean;
};

// null = fine to save; otherwise the Turkish reason it is refused.
export function checkQuestionBankSave(input: QuestionBankSaveInput): string | null {
  const anyCount = input.correct !== null || input.wrong !== null || input.empty !== null;
  if (input.noQuestionsSolved) {
    if (input.isLgs) return NO_QUESTIONS_NOT_FOR_LGS;
    if (anyCount) return NO_QUESTIONS_WITH_COUNTS;
    if (!input.watchedVideo) return NO_QUESTIONS_NEEDS_VIDEO;
    return null;
  }
  // Some counts (even just Doğru, the rest read as 0) is a normal save; none at
  // all needs the box.
  return anyCount ? null : QUESTION_COUNTS_REQUIRED;
}

export function hasWatchedVideo(links: { watched?: boolean }[] | null | undefined): boolean {
  return (links ?? []).some((l) => l.watched === true);
}
