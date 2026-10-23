// İngilizce Kelime Quizi as an ASSIGNED TASK ("1. Ünite - 30 Kelime"): who decides its status.
//
// The student never picks "Yapıldı" / "Yarım Yapıldı" for it -- the quiz does:
//   * the first answer (right or wrong) of the quiz started for the task  -> Yarım Yapıldı (half_done)
//   * the assigned word target reached (correct answers >= total_count)   -> Yapıldı (done)
//   * the quiz run ended with nothing left to do (no target at all, or every word of the unit already learned, so the target could never
//     be reached)                                                          -> Yapıldı (done)
// The one thing the student does choose is "Yapılmadı" (not_done): an explicit "I am not doing this", with or without ever starting.
// Starting and answering again afterwards moves it back to Yarım Yapıldı -- the quiz's progress is the system's, not a pick.
//
// Pure functions only (no database); app/student/ingilizce-quiz/actions.ts applies their results.

export type VocabTaskStatus = "pending" | "done" | "half_done" | "not_done";

export type VocabTaskState = {
  status: string;
  total_count: number | null;
  correct_count: number | null;
};

// A task with no word target that the STUDENT made (the "Ek Çalışma" the quiz creates): open-ended practice, not a goal that can be
// finished once -- practising again later the same day re-opens it, so every run of extra effort is recorded.
export function isOpenEndedExtra(task: { total_count: number | null; is_coach_assigned?: boolean | null }): boolean {
  return task.total_count === null && task.is_coach_assigned === false;
}

export type VocabTaskUpdate = { status: "done" | "half_done"; correct_count: number; completed: boolean };

// The title of the task the quiz creates for a student's own extra practice.
export const EXTRA_STUDY_TITLE = "Ek Çalışma";

// Where the student's answers go when the quiz is opened WITHOUT naming a task (the sidebar, a unit card) -- among the unit's still-open
// vocabulary tasks:
//   1. the one due TODAY;
//   2. else the most recent one from before today that is still UNLOCKED (a task dated before the latest week lock is frozen: the database
//      would refuse the write, so it is never offered);
//   3. else none -- the quiz then records the practice as today's "Ek Çalışma" (ensure in the actions; never an upcoming task, which is not
//      due yet).
// (Picking simply the latest date, as it once did, sent a whole week of answers to next Sunday's task and left today's untouched.)
// `lockedBefore`: tasks dated BEFORE this day are locked (the day of the latest lock itself belongs to the new, open cycle); null = no lock.
export function pickVocabQuizTask<T extends { task_date: string }>(rows: T[], today: string, lockedBefore: string | null = null): T | null {
  const todays = rows.filter((r) => r.task_date === today);
  if (todays.length > 0) return todays[0];
  const past = rows
    .filter((r) => r.task_date < today && (lockedBefore === null || r.task_date >= lockedBefore))
    .sort((a, b) => b.task_date.localeCompare(a.task_date));
  return past[0] ?? null;
}

// The Ünite (1-10) a task stands for (its topic_id holds the number as text).
export function vocabTaskUnit(topicId: string | null | undefined): number {
  const n = Number(topicId);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 1;
}

// The link the card's "Quize Başla" opens: the unit's quiz, tied to THIS task so its answers count for it.
export function vocabQuizHref(unit: number, taskId?: string | null): string {
  return taskId ? `/student/ingilizce-quiz?unit=${unit}&task=${taskId}` : `/student/ingilizce-quiz?unit=${unit}`;
}

// What one answer does to the task. null = nothing to write (the task is already Yapıldı, or a miss on a task that is already Yarım Yapıldı).
// A correct answer adds one to the word count (never past the target); ANY answer makes the task at least Yarım Yapıldı; reaching the
// target makes it Yapıldı. A miss or a "Pas Geç" never takes progress back.
export function taskAfterAnswer(task: VocabTaskState, isCorrect: boolean, options: { reopenDone?: boolean } = {}): VocabTaskUpdate | null {
  if (task.status === "done" && !options.reopenDone) return null;
  const before = task.correct_count ?? 0;
  const raw = before + (isCorrect ? 1 : 0);
  const next = task.total_count !== null ? Math.min(raw, task.total_count) : raw;
  const reached = task.total_count !== null && next >= task.total_count;
  if (!isCorrect && task.status === "half_done") return null;
  // (a re-opened "done" extra restarts as Yarım Yapıldı, even on a miss: the student is practising again)
  return { status: reached ? "done" : "half_done", correct_count: next, completed: reached };
}

// What the END of a quiz run does to the task (the summary screen, or "every word is already learned"). Yapıldı when the target was reached,
// when the task has no target (the run itself is the task), or when no word of the unit is left to learn (the target is out of reach).
// Otherwise null: it stays Yarım Yapıldı and the card shows how far it is.
export function taskAfterRun(task: VocabTaskState, remainingUnmasteredWords: number): VocabTaskUpdate | null {
  if (task.status === "done") return null;
  const count = task.correct_count ?? 0;
  const reached = task.total_count !== null && count >= task.total_count;
  if (reached || task.total_count === null || remainingUnmasteredWords === 0) {
    return { status: "done", correct_count: count, completed: true };
  }
  return null;
}

// The words of a status, as the student reads them on the card.
export function vocabStatusLabel(status: string): string {
  if (status === "done") return "Yapıldı";
  if (status === "half_done") return "Yarım Yapıldı";
  if (status === "not_done") return "Yapılmadı";
  return "Bekliyor";
}

// "12/30 kelime" (or "12 kelime" when the task has no target).
export function vocabProgressText(task: { total_count: number | null; correct_count: number | null }): string {
  const done = task.correct_count ?? 0;
  return task.total_count !== null ? `${done}/${task.total_count} kelime` : `${done} kelime`;
}
