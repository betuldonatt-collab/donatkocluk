// The pieces of the "exam detail" popup (coach Grafikler): which subject tabs a Genel Deneme has, which curriculum
// courses each tab analyses, and the per-subject scores shown above a tab's topic table.
//
// Everything is derived from the exam itself -- its title (the track lives in the title text, there is no course_id on
// a Genel Deneme) and its subject_scores keys -- so the popup needs no student context and shows an exam the same way
// whoever opens it.
import type { Course } from "./curriculum";
import { coursesForExamSection, generalExamSections, parseGeneralExamTrack, usesLgsNet, type GeneralExamTrack } from "./general-exam-track";
import { inferAytTrackFromScores } from "./curriculum/subject-groups";
import { computeLgsNet, computeNet } from "./scoring";

export type SubjectScores = Record<string, { correct: number | null; wrong: number | null; empty: number | null } | undefined>;

export type ExamTrack = GeneralExamTrack;

// General-exam tasks have no course_id -- the track lives only in the title text ("TYT Genel Deneme - ...",
// "Maarif TYT Genel Deneme - ...", "9. SINIF Genel Deneme - ...", "LGS ..."); see lib/general-exam-track.ts.
export function examTrackOf(title: string, subjectScores?: Record<string, unknown> | null): ExamTrack {
  return parseGeneralExamTrack(title, subjectScores);
}

// LGS and the 7th grade lose a right answer per 3 wrong; every other exam per 4.
export function netFunctionFor(track: ExamTrack): (correct: number, wrong: number) => number {
  return usesLgsNet(track) ? computeLgsNet : computeNet;
}

export type ExamSubjectTab = {
  key: string;
  label: string;
  // The curriculum courses whose topic tables this subject shows (empty when the grade has not supplied them yet).
  courses: Course[];
  // The subject_scores key holding this subject's Doğru / Yanlış / Boş.
  scoreKey: string;
};

export function generalExamTabs(exam: { title: string; subject_scores: SubjectScores | null }): ExamSubjectTab[] {
  const track = examTrackOf(exam.title, exam.subject_scores);
  // AYT keeps its field (Sayısal / EA / Sözel) only in which score keys are present.
  const aytTrack = track === "ayt" ? (inferAytTrackFromScores(exam.subject_scores) ?? "sayisal") : null;
  return generalExamSections(track, aytTrack).map((s) => ({
    key: s.key,
    label: s.label,
    scoreKey: s.key,
    courses: coursesForExamSection(track, aytTrack, s.key),
  }));
}

export type ScoreSummary = { correct: number; wrong: number; empty: number; net: number };

// One subject's Doğru / Yanlış / Boş and net; null when no score was entered for it.
export function subjectScoreSummary(scores: SubjectScores | null, scoreKey: string, track: ExamTrack): ScoreSummary | null {
  const s = scores?.[scoreKey];
  if (!s) return null;
  const correct = s.correct ?? 0;
  const wrong = s.wrong ?? 0;
  return { correct, wrong, empty: s.empty ?? 0, net: netFunctionFor(track)(correct, wrong) };
}

// The whole exam's totals across every subject, netted once on the totals (not summed per subject) so rounding never
// compounds -- the same rule the net charts use.
export function examScoreTotals(scores: SubjectScores | null, track: ExamTrack): ScoreSummary | null {
  if (!scores) return null;
  const values = Object.values(scores).filter((s): s is NonNullable<typeof s> => !!s);
  if (values.length === 0) return null;
  const totals = values.reduce<{ correct: number; wrong: number; empty: number }>(
    (acc, s) => ({ correct: acc.correct + (s.correct ?? 0), wrong: acc.wrong + (s.wrong ?? 0), empty: acc.empty + (s.empty ?? 0) }),
    { correct: 0, wrong: 0, empty: 0 },
  );
  return { ...totals, net: netFunctionFor(track)(totals.correct, totals.wrong) };
}

// How many of a course's selectable rows carry a mistake mark in this exam (a row rolls up its member topics).
export function markedRowCount(rows: { memberTopicIds: string[] }[], markedTopicIds: Set<string>): number {
  return rows.filter((r) => r.memberTopicIds.some((id) => markedTopicIds.has(id))).length;
}

// The exams that belong in one side-by-side comparison with `focus`: every Genel Deneme of the same track (TYT with TYT, LGS
// with LGS, one grade with its own grade; AYT also by Sayısal / EA / Sözel, which only the score keys tell), NEWEST first
// (the same order as the Analiz tab's tables): the most recent exam is the leftmost column, history runs towards the right.
// Ties on one day keep a stable order (by id).
export function comparableGeneralExams<T extends { id: string; title: string; task_date: string; task_type: string; subject_scores: SubjectScores | null }>(
  all: T[],
  focus: T,
): T[] {
  const track = examTrackOf(focus.title, focus.subject_scores);
  const aytTrack = (e: T) => inferAytTrackFromScores(e.subject_scores) ?? "sayisal";
  return all
    .filter((e) => e.task_type === "general_exam" && examTrackOf(e.title, e.subject_scores) === track && (track !== "ayt" || aytTrack(e) === aytTrack(focus)))
    .slice()
    .sort((a, b) => b.task_date.localeCompare(a.task_date) || a.id.localeCompare(b.id));
}

// The exams that belong in one side-by-side comparison of a Branş Denemesi: every Branş Denemesi of the SAME course ("TYT Fen" with
// "TYT Fen", "Fizik" with "Fizik" -- the combined and the single-subject courses are different courses) whose date passes `inRange`,
// newest first, ties by id. The clicked exam is always part of it, even if a caller's range would not include it.
export function comparableBranchExams<T extends { id: string; task_type: string; course_id: string | null; task_date: string }>(
  all: T[],
  focus: T,
  inRange: (dateIso: string) => boolean,
): T[] {
  const picked = all.filter((e) => e.task_type === "branch_exam" && e.course_id === focus.course_id && (e.id === focus.id || inRange(e.task_date)));
  if (!picked.some((e) => e.id === focus.id)) picked.push(focus);
  return picked.slice().sort((a, b) => b.task_date.localeCompare(a.task_date) || a.id.localeCompare(b.id));
}

// In how many of the shown exams a topic row was marked (a row rolls up its member topics: any member marked counts once per exam).
// Read as "N / M exams": the chronic weaknesses are the rows with a high N.
export function rowRecurrence(row: { memberTopicIds: string[] }, examIds: string[], markedByExam: Map<string, Set<string>>): number {
  let n = 0;
  for (const id of examIds) {
    const marked = markedByExam.get(id);
    if (marked && row.memberTopicIds.some((t) => marked.has(t))) n++;
  }
  return n;
}

// "TYT Genel Deneme - 3D Yayınları" -> "3D Yayınları" (the publisher is the title's " - " suffix); "—" when there is none.
export function examPublisher(title: string): string {
  const match = title.match(/-\s*([^-]+)$/);
  return match?.[1]?.trim() || "—";
}
