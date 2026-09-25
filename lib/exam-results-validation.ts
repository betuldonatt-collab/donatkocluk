import {
  AYT_SUBJECT_GROUPS_BY_TRACK,
  LGS_EXAM_SUBJECTS,
  MAARIF9_EXAM_SUBJECTS,
  MAARIF10_EXAM_SUBJECTS,
  TYT_SUBJECT_GROUPS,
  inferAytTrackFromScores,
} from "./curriculum/subject-groups";

// "Sonuç girişi" rules shared by every Genel Deneme / Branş Denemesi entry
// form (student task modal, student Ek Çalışma dialog, coach Sonuçları Gir)
// and by the server actions behind them: a Doğru / Yanlış / Boş box is never
// left empty -- a subject the student didn't solve is entered as 0. A blank
// box used to be saved as null, which surfaced later as a confusing error
// instead of being caught up front.

// Per-subject Genel Deneme (a Doğru/Yanlış/Boş row for every ders).
export const GENERAL_EXAM_SCORES_REQUIRED =
  "Lütfen kaydetmek için tüm derslere ait doğru, yanlış ve boş kutucuklarını eksiksiz doldurunuz. Çözmediğiniz dersler için 0 yazabilirsiniz.";

// A single Doğru/Yanlış/Boş set (Branş Denemesi, and the coach's one-overall
// entry for either exam type).
export const EXAM_SCORES_REQUIRED =
  "Lütfen kaydetmek için doğru, yanlış ve boş kutucuklarını eksiksiz doldurunuz. Çözmediğiniz sorular için 0 yazabilirsiniz.";

type Filled = string | number | null | undefined;

// A form box counts as blank when it is empty/whitespace (string state) or
// null/undefined (parsed value). 0 is a real answer, never blank.
export function isBlankScore(value: Filled): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return Number.isNaN(value);
}

// True when any of the given boxes is blank.
export function anyBlankScore(values: Filled[]): boolean {
  return values.some(isBlankScore);
}

type SubjectScore = { correct?: Filled; wrong?: Filled; empty?: Filled };

// A general exam's title is the only place its track lives (no course_id) --
// same convention every panel parses.
function examTrackFromTitle(title: string): "tyt" | "ayt" | "lgs" | "m9" | "m10" {
  if (/^9\.\s*SINIF\b/i.test(title)) return "m9";
  if (/^10\.\s*SINIF\b/i.test(title)) return "m10";
  if (/^LGS\b/i.test(title)) return "lgs";
  return /^AYT\b/i.test(title) ? "ayt" : "tyt";
}

// The subject keys a general exam of this track must carry a full row for.
// null = can't tell (an AYT exam whose alan hasn't been chosen / can't be
// inferred from the scores), in which case only the rows that ARE present
// are checked.
export function expectedGeneralExamKeys(title: string, scores: Record<string, unknown> | null | undefined): string[] | null {
  const track = examTrackFromTitle(title);
  if (track === "lgs") return LGS_EXAM_SUBJECTS.map((s) => s.key);
  if (track === "m9") return MAARIF9_EXAM_SUBJECTS.map((s) => s.key);
  if (track === "m10") return MAARIF10_EXAM_SUBJECTS.map((s) => s.key);
  if (track === "tyt") return TYT_SUBJECT_GROUPS.map((g) => g.key);
  const aytTrack = inferAytTrackFromScores(scores);
  return aytTrack ? AYT_SUBJECT_GROUPS_BY_TRACK[aytTrack].map((g) => g.key) : null;
}

// True when a submitted per-subject Genel Deneme result is NOT complete: a
// required subject is missing altogether, or any of its Doğru/Yanlış/Boş is
// blank. Used by the server as the authoritative backstop for the same check
// the form does before submitting.
export function isGeneralExamScoresIncomplete(
  title: string,
  scores: Record<string, SubjectScore> | null | undefined,
): boolean {
  if (!scores || Object.keys(scores).length === 0) return true;
  const keys = expectedGeneralExamKeys(title, scores) ?? Object.keys(scores);
  return keys.some((key) => {
    const s = scores[key];
    return !s || anyBlankScore([s.correct, s.wrong, s.empty]);
  });
}

// The real, fixed question count for one Genel Deneme section -- null when
// the track/section can't be resolved (an AYT exam before its alan is
// known), same resolution rule expectedGeneralExamKeys uses.
function questionsForGeneralExamKey(
  title: string,
  key: string,
  scores: Record<string, unknown> | null | undefined,
): number | null {
  const track = examTrackFromTitle(title);
  if (track === "lgs") return LGS_EXAM_SUBJECTS.find((s) => s.key === key)?.questions ?? null;
  if (track === "m9") return MAARIF9_EXAM_SUBJECTS.find((s) => s.key === key)?.questions ?? null;
  if (track === "m10") return MAARIF10_EXAM_SUBJECTS.find((s) => s.key === key)?.questions ?? null;
  if (track === "tyt") return TYT_SUBJECT_GROUPS.find((g) => g.key === key)?.questions ?? null;
  const aytTrack = inferAytTrackFromScores(scores);
  if (!aytTrack) return null;
  return AYT_SUBJECT_GROUPS_BY_TRACK[aytTrack].find((g) => g.key === key)?.questions ?? null;
}

// The client auto-derives Boş from Doğru/Yanlış (see task-modal.tsx /
// LgsExamScoreGrid) so this should never actually fire in normal use -- it
// is the server's own backstop against a stale or forged submission whose
// Doğru+Yanlış+Boş doesn't add up to its section's real, fixed question
// count. Returns the first mismatched section (for a message naming it
// specifically, e.g. "Türkçe bölümü toplam 40 soru olmalıdır"), or null
// when every present, complete section matches (or its count can't be
// resolved yet, e.g. an AYT exam with no alan chosen).
export function findGeneralExamTotalMismatch(
  title: string,
  scores: Record<string, SubjectScore> | null | undefined,
): { label: string; questions: number } | null {
  if (!scores) return null;
  for (const key of Object.keys(scores)) {
    const s = scores[key];
    if (!s || anyBlankScore([s.correct, s.wrong, s.empty])) continue;
    const questions = questionsForGeneralExamKey(title, key, scores);
    if (questions === null) continue;
    const sum = Number(s.correct) + Number(s.wrong) + Number(s.empty);
    if (sum !== questions) {
      const track = examTrackFromTitle(title);
      const label =
        track === "lgs"
          ? LGS_EXAM_SUBJECTS.find((s2) => s2.key === key)?.label
          : track === "m10"
            ? MAARIF10_EXAM_SUBJECTS.find((s2) => s2.key === key)?.label
            : track === "m9"
            ? MAARIF9_EXAM_SUBJECTS.find((s2) => s2.key === key)?.label
            : track === "tyt"
            ? TYT_SUBJECT_GROUPS.find((g) => g.key === key)?.label
            : AYT_SUBJECT_GROUPS_BY_TRACK[inferAytTrackFromScores(scores)!].find((g) => g.key === key)?.label;
      return { label: label ?? key, questions };
    }
  }
  return null;
}

export function generalExamTotalMismatchMessage(label: string, questions: number): string {
  return `${label} bölümü toplam ${questions} soru olmalıdır.`;
}
