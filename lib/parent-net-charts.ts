import { isGeneralExamScoresIncomplete } from "./exam-results-validation";
import { computeLgsNet, computeNet } from "./scoring";

// The parent home page's Genel Deneme net charts (one line per exam type).
type SubjectScores = Record<string, { correct?: number; wrong?: number }>;
export type ParentGeneralExam = { id: string; title: string; task_date: string; subject_scores: SubjectScores | null };

// General-exam tasks have no course_id -- the track lives only in the title text, the convention every panel parses.
export function parseGeneralExamTrack(title: string): "tyt" | "ayt" | "lgs" | "m7" | "m9" | "m10" {
  if (/^7\.\s*SINIF\b/i.test(title)) return "m7";
  if (/^9\.\s*SINIF\b/i.test(title)) return "m9";
  if (/^10\.\s*SINIF\b/i.test(title)) return "m10";
  if (/^LGS\b/i.test(title)) return "lgs";
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
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
function completeExamsOf(exams: ParentGeneralExam[], track: "lgs" | "m7") {
  return exams.filter((e) => parseGeneralExamTrack(e.title) === track && !isGeneralExamScoresIncomplete(e.title, e.subject_scores as never));
}

export function lgsNetChart(exams: ParentGeneralExam[]) {
  return netChartFor(completeExamsOf(exams, "lgs"), computeLgsNet);
}

// A 7th grader's chart: their "7. SINIF Genel Deneme" exams (the LGS distribution: six subjects, 90 questions), net
// with LGS's 3 yanlış 1 doğruyu götürür.
export function maarif7NetChart(exams: ParentGeneralExam[]) {
  return netChartFor(completeExamsOf(exams, "m7"), computeLgsNet);
}
