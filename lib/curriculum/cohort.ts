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

export const YKS_CURRICULUM_COURSE_IDS: string[] = [
  ...TYT_COURSES.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sayisal.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.ea.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sozel.map((c) => c.id),
  ...BRANCH_EXAM_MACRO_COURSES.map((c) => c.id),
];

export const LGS_CURRICULUM_COURSE_IDS: string[] = LGS_COURSES.map((c) => c.id);

export const MAARIF7_CURRICULUM_COURSE_IDS: string[] = MAARIF7_KAYNAK_COURSES.map((c) => c.id);

// `maarifGrade`: a 7th grader's analytics (Konu Performans Haritası, Gelişim Haritası, Karne) cover the 7th
// grade's own six courses, not the YKS list their exam_type ('YKS') would otherwise give them. Other Maarif
// grades keep what they had.
export function curriculumCourseIdsFor(examType: ExamType, maarifGrade: number | null = null): string[] {
  if (maarifGrade === 7) return MAARIF7_CURRICULUM_COURSE_IDS;
  return examType === "LGS" ? LGS_CURRICULUM_COURSE_IDS : YKS_CURRICULUM_COURSE_IDS;
}
