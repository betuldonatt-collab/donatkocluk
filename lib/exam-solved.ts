// Which exams the Deneme Analizleri views (student Branş / Genel pages, the coach's Analiz tab and the coach's comparison popup) list.
//
// Three states, told apart by data the app already keeps (decided with the user, 2026-10-23):
//   * UNSOLVED           -- no results at all: not listed.
//   * SOLVED, UNANALYSED -- results are in but the topic-by-topic analysis is not done: analysis_pending = true (the very flag behind the
//                           student's "Analiz Bekliyor" badge and the coach dashboard's alert; the student clears it by finishing the
//                           analysis, the coach's "Sonuçları kaydet" clears it too). Shown apart, in the yellow box.
//   * SOLVED, ANALYSED   -- results in and analysis_pending = false: the regular list.
// "Has results" means Doğru / Yanlış / Boş (or per-subject scores) were entered -- whatever the task's status: a card the coach merely painted
// "Yapıldı", with nothing entered, is still unsolved; an LGS / 7th-grade exam with results that still waits for the coach's approval is solved.

export type ExamStateFields = {
  correct_count?: number | null;
  wrong_count?: number | null;
  empty_count?: number | null;
  subject_scores?: Record<string, unknown> | null;
  analysis_pending?: boolean | null;
};

export function examHasResults(exam: ExamStateFields): boolean {
  if (exam.correct_count != null || exam.wrong_count != null || exam.empty_count != null) return true;
  const scores = exam.subject_scores;
  return !!scores && typeof scores === "object" && Object.keys(scores).length > 0;
}

// A pending analysis always means results exist (it is only ever set when results are saved); trusting the flag too means a pending alert is
// never hidden by a row that lost its numbers.
export function examIsSolved(exam: ExamStateFields): boolean {
  return exam.analysis_pending === true || examHasResults(exam);
}

export function examNeedsAnalysis(exam: ExamStateFields): boolean {
  return exam.analysis_pending === true;
}

// The exams a list shows: "analyzed" are the regular rows (order kept); "pending" go to the yellow box; unsolved ones are dropped.
export function splitExamsByAnalysis<T extends ExamStateFields>(exams: T[]): { analyzed: T[]; pending: T[] } {
  const analyzed: T[] = [];
  const pending: T[] = [];
  for (const exam of exams) {
    if (examNeedsAnalysis(exam)) pending.push(exam);
    else if (examHasResults(exam)) analyzed.push(exam);
  }
  return { analyzed, pending };
}
