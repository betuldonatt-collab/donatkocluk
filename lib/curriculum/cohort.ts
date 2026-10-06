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
import {
  MAARIF9_EXAM_SUBJECTS,
  MAARIF10_EXAM_SUBJECTS,
  MAARIF7_EXAM_SUBJECTS,
  TYT_SUBJECT_GROUPS,
  coursesForMaarifTytGroup,
} from "./subject-groups";

export const YKS_CURRICULUM_COURSE_IDS: string[] = [
  ...TYT_COURSES.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sayisal.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.ea.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sozel.map((c) => c.id),
  ...BRANCH_EXAM_MACRO_COURSES.map((c) => c.id),
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

// The courses ONE general exam counts toward, read from its title (a general exam has no course_id): the
// denominator of each course's topic map. An LGS exam covers the LGS courses, a 7th/9th/10th-grade one that
// grade's courses, anything else the TYT groups.
export function generalExamCourseIdsForTitle(title: string): string[] {
  if (/^LGS\b/i.test(title)) return LGS_CURRICULUM_COURSE_IDS;
  if (/^7\.\s*SINIF\b/i.test(title)) return MAARIF7_EXAM_SUBJECTS.flatMap((s) => s.courseIds);
  if (/^9\.\s*SINIF\b/i.test(title)) return MAARIF9_EXAM_SUBJECTS.flatMap((s) => s.courseIds);
  if (/^10\.\s*SINIF\b/i.test(title)) return MAARIF10_EXAM_SUBJECTS.flatMap((s) => s.courseIds);
  // An 11th grader's exam is TYT-structured but analysed against the merged Maarif TYT courses.
  if (/^11\.\s*SINIF\b/i.test(title)) return TYT_SUBJECT_GROUPS.flatMap((g) => coursesForMaarifTytGroup(g.key).map((c) => c.id));
  return TYT_SUBJECT_GROUPS.flatMap((g) => g.courseIds);
}
