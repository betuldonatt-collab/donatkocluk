import { isGeneralExamScoresIncomplete } from "./exam-results-validation";

// LGS students only: what a task needs before it can be completed (and so sent
// to the coach for approval).
//
//   - Every task EXCEPT Kitap Okuma needs at least one evidence photo
//     (Kanıt Fotoğrafı); Kitap Okuma's Başlangıç/Bitiş Sayfası range (the
//     caller derives `correct` -- Okunan Sayfa -- from it, see
//     task-modal.tsx) is proof enough on its own instead.
//   - Soru Çözümü, Branş Denemesi and Genel Deneme also need their Doğru /
//     Yanlış / Boş results (0 for what wasn't solved -- never left blank);
//     a Genel Deneme needs a full row for every subject.
//
// Returns the message to show the student, or null when the task is ready.
// YKS / 9th / 10th-grade students never go through this (they complete
// immediately as before); the caller decides that from the cohort.
export function lgsCompletionProblem(input: {
  taskType: string;
  title: string;
  photoCount: number;
  correct: number | null | undefined;
  wrong: number | null | undefined;
  empty: number | null | undefined;
  subjectScores: Record<string, { correct?: number | null; wrong?: number | null; empty?: number | null }> | null | undefined;
}): string | null {
  if (input.taskType === "reading") {
    if (input.correct == null) {
      return "Bu görevi tamamlamak için başlangıç ve bitiş sayfasını girmelisin.";
    }
    return null;
  }
  if (input.photoCount < 1) {
    return "Bu görevi tamamlamak için en az bir kanıt fotoğrafı yüklemelisin.";
  }
  if (input.taskType === "question_bank" || input.taskType === "branch_exam") {
    if (input.correct == null || input.wrong == null || input.empty == null) {
      return "Bu görevi tamamlamak için doğru, yanlış ve boş sayılarını girmelisin (çözmediklerin için 0 yaz).";
    }
  }
  if (input.taskType === "general_exam") {
    if (isGeneralExamScoresIncomplete(input.title, input.subjectScores as never)) {
      return "Genel denemeyi tamamlamak için tüm derslerin doğru, yanlış ve boş sayılarını girmelisin (çözmediklerin için 0 yaz).";
    }
  }
  return null;
}
