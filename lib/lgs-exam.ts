import { LGS_EXAM_SUBJECTS } from "./curriculum/subject-groups";
import { computeLgsNet } from "./scoring";

// The classic LGS exam (current 8th graders sit this one, not the Maarif
// curriculum): 90 questions in two sessions --
//   Sözel:   Türkçe 20, T.C. İnkılap Tarihi 10, Din Kültürü 10, İngilizce 10
//   Sayısal: Matematik 20, Fen Bilimleri 20
// 3 yanlış 1 doğruyu götürür. The six subjects and their question counts live in
// LGS_EXAM_SUBJECTS (the keys general-exam subject_scores are stored under); this
// module adds the per-subject arithmetic and the approximate puan on top of them.

export const LGS_QUESTION_TOTAL = LGS_EXAM_SUBJECTS.reduce((sum, s) => sum + s.questions, 0);

// MEB weights Türkçe, Matematik and Fen four times as heavily as the other three.
export const LGS_COEFFICIENTS: Record<string, number> = {
  lgs_turkce: 4,
  lgs_matematik: 4,
  lgs_fen: 4,
  lgs_inkilap: 1,
  lgs_din: 1,
  lgs_ingilizce: 1,
};

// Approximate puan, the "internet calculator" model students expect:
//   puan = 194 + 306 * (weighted net / 270)
// where weighted net = (Türkçe + Matematik + Fen nets) * 4 + (İnkılap + Din +
// İngilizce nets) * 1 and 270 is the best possible weighted net. A blank exam is
// 194 and a perfect one 500. The real LGS puan is standardised against that
// year's cohort (standard deviation), which no static formula can reproduce, so
// this is shown as "yaklaşık" (approximate) everywhere.
export const LGS_MIN_SCORE = 194;
export const LGS_MAX_SCORE = 500;

const MAX_WEIGHTED_NET = LGS_EXAM_SUBJECTS.reduce((sum, s) => sum + s.questions * (LGS_COEFFICIENTS[s.key] ?? 1), 0);

export type LgsSubjectResult = {
  key: string;
  label: string;
  section: "SÖZEL" | "SAYISAL";
  questions: number;
  correct: number;
  wrong: number;
  // Derived: questions - correct - wrong (never negative).
  empty: number;
  net: number;
  // Doğru + Yanlış is more than the subject has questions.
  overCap: boolean;
};

function subjectByKey(key: string) {
  return LGS_EXAM_SUBJECTS.find((s) => s.key === key);
}

// Boş is never typed: it is what is left of the subject's questions. null until
// both Doğru and Yanlış are known (blank boxes stay blank, they don't read as 0).
export function lgsEmptyFor(key: string, correct: number | null, wrong: number | null): number | null {
  const subject = subjectByKey(key);
  if (!subject || correct === null || wrong === null) return null;
  return Math.max(0, subject.questions - correct - wrong);
}

export function computeLgsSubjectResult(key: string, correct: number, wrong: number): LgsSubjectResult | null {
  const subject = subjectByKey(key);
  if (!subject) return null;
  return {
    key,
    label: subject.label,
    section: subject.section,
    questions: subject.questions,
    correct,
    wrong,
    empty: Math.max(0, subject.questions - correct - wrong),
    net: computeLgsNet(correct, wrong),
    overCap: correct + wrong > subject.questions,
  };
}

// Approximate puan from per-subject nets (keyed by LGS_EXAM_SUBJECTS keys).
// Missing subjects count as 0 net. Rounded to 2 decimals, clamped to 194..500
// (a lot of wrong answers can push the weighted net below zero).
export function computeLgsApproxScore(nets: Record<string, number>): number {
  const weighted = LGS_EXAM_SUBJECTS.reduce((sum, s) => sum + (nets[s.key] ?? 0) * (LGS_COEFFICIENTS[s.key] ?? 1), 0);
  const raw = LGS_MIN_SCORE + ((LGS_MAX_SCORE - LGS_MIN_SCORE) * weighted) / MAX_WEIGHTED_NET;
  return Math.round(Math.min(LGS_MAX_SCORE, Math.max(LGS_MIN_SCORE, raw)) * 100) / 100;
}

export type LgsExamSummary = {
  subjects: LgsSubjectResult[];
  sozelNet: number;
  sayisalNet: number;
  totalNet: number;
  approxScore: number;
};

type ScoreInput = { correct: number | null; wrong: number | null; empty?: number | null };

// Whole-exam summary from a stored subject_scores object. null when the exam has
// no per-subject results yet, or any of the six subjects is missing/blank (a
// half-entered exam would produce a misleading net and puan).
export function summarizeLgsScores(scores: Record<string, ScoreInput> | null | undefined): LgsExamSummary | null {
  if (!scores) return null;
  const subjects: LgsSubjectResult[] = [];
  for (const s of LGS_EXAM_SUBJECTS) {
    const raw = scores[s.key];
    if (!raw || raw.correct === null || raw.correct === undefined || raw.wrong === null || raw.wrong === undefined) return null;
    const result = computeLgsSubjectResult(s.key, raw.correct, raw.wrong);
    if (!result) return null;
    subjects.push(result);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const sozelNet = round(subjects.filter((s) => s.section === "SÖZEL").reduce((sum, s) => sum + s.net, 0));
  const sayisalNet = round(subjects.filter((s) => s.section === "SAYISAL").reduce((sum, s) => sum + s.net, 0));
  return {
    subjects,
    sozelNet,
    sayisalNet,
    totalNet: round(sozelNet + sayisalNet),
    approxScore: computeLgsApproxScore(Object.fromEntries(subjects.map((s) => [s.key, s.net]))),
  };
}

export function formatNet(net: number): string {
  return net.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export type LgsNormalizedScores =
  | {
      ok: true;
      // Full Doğru / Yanlış / Boş row for all six subjects, Boş derived.
      scores: Record<string, { correct: number; wrong: number; empty: number }>;
      totals: { total: number; correct: number; wrong: number; empty: number };
    }
  | { ok: false; error: string };

// The server's authoritative pass over a submitted LGS result: every subject
// needs both Doğru and Yanlış (0 for an unsolved subject), Doğru + Yanlış can't
// exceed the subject's questions, and Boş is recomputed here rather than
// trusted from the client. Also rolls the six rows up into the flat
// total/correct/wrong/empty a task card reads.
export function normalizeLgsScores(scores: Record<string, ScoreInput> | null | undefined): LgsNormalizedScores {
  const out: Record<string, { correct: number; wrong: number; empty: number }> = {};
  for (const s of LGS_EXAM_SUBJECTS) {
    const raw = scores?.[s.key];
    if (!raw || raw.correct === null || raw.correct === undefined || raw.wrong === null || raw.wrong === undefined) {
      return {
        ok: false,
        error:
          "Lütfen kaydetmek için tüm derslere ait doğru ve yanlış kutucuklarını eksiksiz doldurunuz. Çözmediğiniz dersler için 0 yazabilirsiniz.",
      };
    }
    if (!Number.isInteger(raw.correct) || !Number.isInteger(raw.wrong) || raw.correct < 0 || raw.wrong < 0) {
      return { ok: false, error: `${s.label} için geçerli bir doğru/yanlış sayısı gir.` };
    }
    if (raw.correct + raw.wrong > s.questions) {
      return { ok: false, error: `${s.label} için Doğru + Yanlış en fazla ${s.questions} olabilir.` };
    }
    out[s.key] = { correct: raw.correct, wrong: raw.wrong, empty: s.questions - raw.correct - raw.wrong };
  }
  const rows = Object.values(out);
  const correct = rows.reduce((sum, r) => sum + r.correct, 0);
  const wrong = rows.reduce((sum, r) => sum + r.wrong, 0);
  const empty = rows.reduce((sum, r) => sum + r.empty, 0);
  return { ok: true, scores: out, totals: { total: correct + wrong + empty, correct, wrong, empty } };
}

export type LgsHistoryExam = { id: string; task_date: string; title: string; summary: LgsExamSummary };

type StoredExam = {
  id: string;
  task_date: string;
  title: string;
  subject_scores: Record<string, ScoreInput> | null;
};

// The student's finished LGS mock exams, newest first: general exams whose title
// says LGS and whose result has all six subjects (an exam still waiting for its
// result has nothing to show and is left out).
export function buildLgsExamHistory(tasks: StoredExam[]): LgsHistoryExam[] {
  return tasks
    .filter((t) => /^LGS\b/i.test(t.title))
    .flatMap((t) => {
      const summary = summarizeLgsScores(t.subject_scores);
      return summary ? [{ id: t.id, task_date: t.task_date, title: t.title, summary }] : [];
    })
    .sort((a, b) => b.task_date.localeCompare(a.task_date));
}
