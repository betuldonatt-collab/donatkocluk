// Which curriculum courses belong to which cohort -- the one place the rest
// of the app asks "which course ids does this student's analytics cover".
import {
  AYT_COURSES_BY_TRACK,
  BRANCH_EXAM_MACRO_COURSES,
  LGS_COURSES,
  TYT_COURSES,
} from "./index";
import type { ExamType } from "../exam-type";
import { MAARIF7_KAYNAK_COURSES } from "./maarif7";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";
import { MAARIF11_KAYNAK_COURSES } from "./maarif11";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";
import { inferAytTrackFromScores } from "./subject-groups";
import { generalExamCourseIds, parseGeneralExamTrack } from "../general-exam-track";

// Each id once: the AYT subjects shared by two fields are one course now.
export const YKS_CURRICULUM_COURSE_IDS: string[] = [
  ...new Set([
    ...TYT_COURSES.map((c) => c.id),
    ...AYT_COURSES_BY_TRACK.sayisal.map((c) => c.id),
    ...AYT_COURSES_BY_TRACK.ea.map((c) => c.id),
    ...AYT_COURSES_BY_TRACK.sozel.map((c) => c.id),
    ...BRANCH_EXAM_MACRO_COURSES.map((c) => c.id),
  ]),
];

export const LGS_CURRICULUM_COURSE_IDS: string[] = LGS_COURSES.map((c) => c.id);

export const MAARIF7_CURRICULUM_COURSE_IDS: string[] = MAARIF7_KAYNAK_COURSES.map((c) => c.id);

export const MAARIF9_CURRICULUM_COURSE_IDS: string[] = MAARIF9_KAYNAK_COURSES.map((c) => c.id);
export const MAARIF10_CURRICULUM_COURSE_IDS: string[] = MAARIF10_KAYNAK_COURSES.map((c) => c.id);

// The 11th grade works on two sets of courses (the coach's Ders list offers both): its own "11. Sınıf" courses and the
// merged "Maarif TYT" ones -- the courses its TYT-structured Genel Deneme is analysed against, so every mistake it logs
// there carries one of these ids.
export const MAARIF11_CURRICULUM_COURSE_IDS: string[] = [
  ...MAARIF11_KAYNAK_COURSES.map((c) => c.id),
  ...MAARIF_TYT_MERGED_COURSES.map((c) => c.id),
];

// `maarifGrade`: a 7th, 9th or 10th grader's analytics (Konu Performans Haritası, Gelişim Haritası, Karne) cover
// that grade's own courses, not the YKS list their exam_type ('YKS') would otherwise give them -- with it a
// Maarif student's topic map found no rows for any of their courses ("Bu ders için konu verisi yok"). The 11th
// grade covers its own courses and the merged Maarif TYT ones (the YKS list it used to get matched none of its data, so
// its Gelişim Haritası / Konu Performans maps showed nothing).
export function curriculumCourseIdsFor(examType: ExamType, maarifGrade: number | null = null): string[] {
  if (maarifGrade === 11 && examType !== "LGS") return MAARIF11_CURRICULUM_COURSE_IDS;
  if (maarifGrade === 7) return MAARIF7_CURRICULUM_COURSE_IDS;
  if (maarifGrade === 9) return MAARIF9_CURRICULUM_COURSE_IDS;
  if (maarifGrade === 10) return MAARIF10_CURRICULUM_COURSE_IDS;
  return examType === "LGS" ? LGS_CURRICULUM_COURSE_IDS : YKS_CURRICULUM_COURSE_IDS;
}

// The courses ONE general exam counts toward, read from its title (a general exam has no course_id) -- the track comes from
// lib/general-exam-track.ts: an LGS exam covers the LGS courses, a 7th / 9th / 10th-grade one that grade's, Maarif TYT the merged
// Maarif TYT courses, the 11th grade's own exam its Genel Deneme courses, AYT the courses of its field, anything else the TYT ones.
export function generalExamCourseIdsForTitle(title: string, subjectScores?: Record<string, unknown> | null): string[] {
  const track = parseGeneralExamTrack(title, subjectScores);
  if (track === "lgs") return LGS_CURRICULUM_COURSE_IDS;
  return generalExamCourseIds(track, track === "ayt" ? (inferAytTrackFromScores(subjectScores) ?? "sayisal") : null);
}
