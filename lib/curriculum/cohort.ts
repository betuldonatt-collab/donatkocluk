// Which curriculum courses belong to which cohort -- the one place the rest
// of the app asks "which course ids does this student's analytics cover".
import {
  AYT_COURSES_BY_TRACK,
  BRANCH_EXAM_MACRO_COURSES,
  LGS_COURSES,
  TYT_COURSES,
} from "./index";
import type { ExamType } from "../exam-type";

export const YKS_CURRICULUM_COURSE_IDS: string[] = [
  ...TYT_COURSES.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sayisal.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.ea.map((c) => c.id),
  ...AYT_COURSES_BY_TRACK.sozel.map((c) => c.id),
  ...BRANCH_EXAM_MACRO_COURSES.map((c) => c.id),
];

export const LGS_CURRICULUM_COURSE_IDS: string[] = LGS_COURSES.map((c) => c.id);

export function curriculumCourseIdsFor(examType: ExamType): string[] {
  return examType === "LGS" ? LGS_CURRICULUM_COURSE_IDS : YKS_CURRICULUM_COURSE_IDS;
}
