import { isGeneralExamScoresIncomplete } from "./exam-results-validation";
import { parseGeneralExamTrack as parseExamTrack } from "./general-exam-track";
import { computeLgsNet, computeNet } from "./scoring";

// The parent home page's Genel Deneme net charts (one line per exam type).
type SubjectScores = Record<string, { correct?: number; wrong?: number }>;
export type ParentGeneralExam = { id: string; title: string; task_date: string; subject_scores: SubjectScores | null };

// General-exam tasks have no course_id -- the track lives only in the title text (lib/general-exam-track.ts). The parent's "TYT" line
// also carries a Maarif TYT exam (same four sections, same 4:1 net -- the 11th grader's usual exam); the 11th grade's own exam ("m11")
// has its own chart below.
export function parseGeneralExamTrack(
  title: string,
  subjectScores?: Record<string, unknown> | null,
): "tyt" | "ayt" | "lgs" | "m7" | "m9" | "m10" | "m11" {
  const track = parseExamTrack(title, subjectScores);
  return track === "mtyt" ? "tyt" : track;
}

// Overall net = sum of correct/wrong across all subjects, netted once on the totals (not summed per-subject net) so
// rounding never compounds. Unlike the student's own Genel Analiz page, this doesn't split AYT by track -- the
// parent view just wants one line per exam type. netFn is the cohort's own negative-marking rule (YKS 4:1, LGS 3:1).
export function netChartFor(exams: ParentGeneralExam[], netFn: (correct: number, wrong: number) => number = computeNet) {
  return exams
    .filter((e) => e.subject_scores)
    .slice()
    .sort((a, b) => a.task_date.localeCompare(b.task_date))
    .map((e) => {
      const totals = Object.values(e.subject_scores!).reduce<{ correct: number; wrong: number }>(
        (acc, s) => ({ correct: acc.correct + (s.correct ?? 0), wrong: acc.wrong + (s.wrong ?? 0) }),
        { correct: 0, wrong: 0 },
      );
      return { date: e.task_date, value: netFn(totals.correct, totals.wrong) };
    });
}

// Only exams with a complete, valid result set (every subject's Doğru/Yanlış/Boş) reach the chart -- a half-entered
// exam never plots a misleading net.
function completeExamsOf(exams: ParentGeneralExam[], track: "lgs" | "m7" | "m11") {
  return exams.filter(
    (e) => parseGeneralExamTrack(e.title, e.subject_scores) === track && !isGeneralExamScoresIncomplete(e.title, e.subject_scores as never),
  );
}

export function lgsNetChart(exams: ParentGeneralExam[]) {
  return netChartFor(completeExamsOf(exams, "lgs"), computeLgsNet);
}

// A 7th grader's chart: their "7. SINIF Genel Deneme" exams (the LGS distribution: six subjects, 90 questions), net
// with LGS's 3 yanlış 1 doğruyu götürür.
export function maarif7NetChart(exams: ParentGeneralExam[]) {
  return netChartFor(completeExamsOf(exams, "m7"), computeLgsNet);
}

// The 11th grade's own exam (four sections of 40, 160 questions, net 4:1): "Maarif 11. Sınıf Genel Deneme".
export function maarif11NetChart(exams: ParentGeneralExam[]) {
  return netChartFor(completeExamsOf(exams, "m11"));
}
