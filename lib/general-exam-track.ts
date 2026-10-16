// THE one place a Genel Deneme's track is defined, parsed from its title, built into a title, and mapped to its sections.
//
// A Genel Deneme has no course_id: its track lives only in the title text ("TYT Genel Deneme - 3D Yayınları") and, for AYT, in
// which score keys are present. Every screen of both panels used to carry its own copy of the title regexes, which is exactly
// how a new track gets forgotten in one of them -- they all go through this file now (a guard test fails if a copy comes back).
//
// Tracks:
//   tyt   "TYT Genel Deneme"        4 sections (TYT_SUBJECT_GROUPS), TYT courses
//   ayt   "AYT Genel Deneme"        the sections of the field (Sayısal / EA / Sözel, told apart by the score keys present)
//   lgs   "LGS Genel Deneme"        the six LGS subjects
//   m7    "7. SINIF Genel Deneme"   the 7th grade's six subjects (LGS-style, net 3:1)
//   m9    "9. SINIF Genel Deneme"   the 9th grade's own exam ("Maarif 9. Sınıf")
//   m10   "10. SINIF Genel Deneme"  the 10th grade's own exam ("Maarif 10. Sınıf")
//   mtyt  "Maarif TYT Genel Deneme" the TYT-structured exam of the Maarif model: TYT's 4 sections and question counts, but
//                                   analysed against the merged 9th + 10th grade "Maarif TYT" courses
//   m11   "11. SINIF Genel Deneme"  the 11th grade's own exam ("Maarif 11. Sınıf"): 4 sections of 40 questions (160)
//
// Legacy: before "Maarif TYT" existed an 11th grader's TYT-structured exam was titled "11. SINIF Genel Deneme". A title like that
// whose scores carry the TYT keys (turkce / sosyal / matematik / fen) is read as Maarif TYT (migration 0137 also renames such
// rows; this keeps any that slip through correct).
import type { Course } from "./curriculum";
import {
  AYT_SUBJECT_GROUPS_BY_TRACK,
  LGS_EXAM_SUBJECTS,
  MAARIF7_EXAM_SUBJECTS,
  MAARIF9_EXAM_SUBJECTS,
  MAARIF10_EXAM_SUBJECTS,
  MAARIF11_EXAM_SUBJECTS,
  TYT_SUBJECT_GROUPS,
  type SubjectGroupKey,
  coursesForAytGroup,
  coursesForGroup,
  coursesForLgsExamSubject,
  coursesForMaarif7ExamSubject,
  coursesForMaarif9ExamSubject,
  coursesForMaarif10ExamSubject,
  coursesForMaarif11ExamSubject,
  coursesForMaarifTytGroup,
} from "./curriculum/subject-groups";
import type { Track } from "./curriculum";

// A const tuple so the Server Actions' zod schemas (z.enum(GENERAL_EXAM_TRACKS)) can never fall out of step with the type.
export const GENERAL_EXAM_TRACKS = ["tyt", "ayt", "lgs", "m7", "m9", "m10", "mtyt", "m11"] as const;

export type GeneralExamTrack = (typeof GENERAL_EXAM_TRACKS)[number];

// The text each track puts in front of "Genel Deneme" in a title.
const TITLE_PREFIX: Record<GeneralExamTrack, string> = {
  tyt: "TYT",
  ayt: "AYT",
  lgs: "LGS",
  m7: "7. SINIF",
  m9: "9. SINIF",
  m10: "10. SINIF",
  mtyt: "Maarif TYT",
  m11: "11. SINIF",
};

// How a track is named on screen ("… Genel Deneme Karşılaştırması", the Sınav Türü pills ...).
export const GENERAL_EXAM_TRACK_LABELS: Record<GeneralExamTrack, string> = {
  tyt: "TYT",
  ayt: "AYT",
  lgs: "LGS",
  m7: "7. Sınıf",
  m9: "Maarif 9. Sınıf",
  m10: "Maarif 10. Sınıf",
  mtyt: "Maarif TYT",
  m11: "Maarif 11. Sınıf",
};

// The four options a Maarif (9th / 10th / 11th grade) student's Genel Deneme is chosen from, in this order.
export const MAARIF_GENERAL_EXAM_TRACKS: GeneralExamTrack[] = ["mtyt", "m11", "m10", "m9"];

// The track a Maarif student's Genel Deneme form opens on: its own grade's exam -- except the 11th grade, whose usual exam is the
// TYT-structured Maarif TYT one.
export function defaultMaarifGeneralExamTrack(grade: 7 | 9 | 10 | 11): GeneralExamTrack {
  return grade === 7 ? "m7" : grade === 9 ? "m9" : grade === 10 ? "m10" : "mtyt";
}

// LGS and the 7th grade lose a right answer per 3 wrong; every other exam per 4.
export function usesLgsNet(track: GeneralExamTrack): boolean {
  return track === "lgs" || track === "m7";
}

const TYT_SCORE_KEYS = TYT_SUBJECT_GROUPS.map((g) => g.key as string);

// True when per-subject scores are TYT-shaped (and not the 11th grade's own m11_ keys).
export function hasTytScoreKeys(scores: Record<string, unknown> | null | undefined): boolean {
  if (!scores) return false;
  const keys = Object.keys(scores);
  return keys.some((k) => TYT_SCORE_KEYS.includes(k)) && !keys.some((k) => k.startsWith("m11_"));
}

// The track a Genel Deneme title says it is. Anything unrecognised is a plain TYT exam (what every screen has always assumed).
// Pass the exam's subject_scores when you have them: they settle the legacy "11. SINIF" title (see the header).
export function parseGeneralExamTrack(title: string, subjectScores?: Record<string, unknown> | null): GeneralExamTrack {
  const t = title.trim();
  if (/^7\.\s*SINIF\b/i.test(t)) return "m7";
  if (/^9\.\s*SINIF\b/i.test(t)) return "m9";
  if (/^10\.\s*SINIF\b/i.test(t)) return "m10";
  if (/^11\.\s*SINIF\b/i.test(t)) return hasTytScoreKeys(subjectScores) ? "mtyt" : "m11";
  if (/^MAARIF\s+TYT\b/i.test(t)) return "mtyt";
  if (/^LGS\b/i.test(t)) return "lgs";
  return /^AYT\b/i.test(t) ? "ayt" : "tyt";
}

// "TYT Genel Deneme - 3D Yayınları" (the publisher is optional; an unknown / missing track is TYT).
export function buildGeneralExamTitle(track: GeneralExamTrack | null | undefined, publisher: string | null | undefined): string {
  const prefix = TITLE_PREFIX[track ?? "tyt"] ?? TITLE_PREFIX.tyt;
  const pub = publisher?.trim();
  return pub ? `${prefix} Genel Deneme - ${pub}` : `${prefix} Genel Deneme`;
}

// Reverses buildGeneralExamTitle (the edit form re-opens a saved title as a track + publisher).
export function parseGeneralExamTitle(
  title: string,
  subjectScores?: Record<string, unknown> | null,
): { track: GeneralExamTrack; publisher: string } {
  const match = title.match(/^(Maarif\s+TYT|TYT|AYT|LGS|7\.\s*SINIF|9\.\s*SINIF|10\.\s*SINIF|11\.\s*SINIF)\s+Genel Deneme(?:\s*-\s*(.*))?$/i);
  return { track: match ? parseGeneralExamTrack(match[1], subjectScores) : "tyt", publisher: match?.[2]?.trim() ?? "" };
}

export type ExamSection = { key: string; label: string; courseIds: string[]; questions: number; section?: string };

// The sections an exam of this track is scored in (AYT needs its field; null / unknown = none yet).
export function generalExamSections(track: GeneralExamTrack, aytTrack: Track | null): ExamSection[] {
  switch (track) {
    case "lgs":
      return LGS_EXAM_SUBJECTS;
    case "m7":
      return MAARIF7_EXAM_SUBJECTS;
    case "m9":
      return MAARIF9_EXAM_SUBJECTS;
    case "m10":
      return MAARIF10_EXAM_SUBJECTS;
    case "m11":
      // each section is one score row of its own: no extra section heading above it in the entry form
      return MAARIF11_EXAM_SUBJECTS.map((s) => ({ key: s.key, label: s.label, courseIds: s.courseIds, questions: s.questions }));
    case "mtyt":
    case "tyt":
      return TYT_SUBJECT_GROUPS;
    case "ayt":
      return aytTrack ? AYT_SUBJECT_GROUPS_BY_TRACK[aytTrack] : [];
  }
}

// The curriculum courses one section's topics are analysed against.
export function coursesForExamSection(track: GeneralExamTrack, aytTrack: Track | null, key: string): Course[] {
  switch (track) {
    case "lgs":
      return coursesForLgsExamSubject(key);
    case "m7":
      return coursesForMaarif7ExamSubject(key);
    case "m9":
      return coursesForMaarif9ExamSubject(key);
    case "m10":
      return coursesForMaarif10ExamSubject(key);
    case "m11":
      return coursesForMaarif11ExamSubject(key);
    case "mtyt":
      return coursesForMaarifTytGroup(key);
    case "tyt":
      return coursesForGroup(key as SubjectGroupKey);
    case "ayt":
      return aytTrack ? coursesForAytGroup(aytTrack, key) : [];
  }
}

// Every course id one exam of this track is analysed against (the denominator of the per-course topic maps).
export function generalExamCourseIds(track: GeneralExamTrack, aytTrack: Track | null): string[] {
  return generalExamSections(track, aytTrack).flatMap((s) => coursesForExamSection(track, aytTrack, s.key).map((c) => c.id));
}
