import type { SupabaseClient } from "@supabase/supabase-js";

import { TYT_BRANCH_EXAM_MACRO_COURSES, TYT_COURSES, yksCourseOptions, type Course } from "./curriculum";
import { MAARIF7_KAYNAK_COURSES, isMaarif7CourseId } from "./curriculum/maarif7";
import { MAARIF9_KAYNAK_COURSES, isMaarif9CourseId } from "./curriculum/maarif9";
import { MAARIF10_KAYNAK_COURSES, isMaarif10CourseId } from "./curriculum/maarif10";
import { MAARIF11_KAYNAK_COURSES, isMaarif11CourseId } from "./curriculum/maarif11";
import {
  MAARIF7_EXAM_SUBJECTS,
  MAARIF7_SUBJECT_GROUPS,
  MAARIF9_EXAM_SUBJECTS,
  MAARIF10_EXAM_SUBJECTS,
  coursesForMaarif7ExamSubject,
  coursesForMaarif9ExamSubject,
  coursesForMaarif10ExamSubject,
} from "./curriculum/subject-groups";

// Maarif ("Türkiye Yüzyılı") grades a student can be flagged with:
// profiles.is_maarif7 (0119), is_maarif9 (0096), is_maarif10 (0099) or is_maarif11 (0114) --
// pairwise mutually exclusive (a CHECK constraint enforces it). Everything
// that picks WHICH curriculum a student sees goes through this one table,
// so grades can never leak into each other: a 9th grader is only ever
// offered the 9th grade's courses/subjects, and so on.
export type MaarifGrade = 7 | 9 | 10 | 11;

export type MaarifExamSubject = { key: string; label: string; section: string; courseIds: string[]; questions: number };

export type GeneralExamTrack = "tyt" | "ayt" | "lgs" | "m7" | "m9" | "m10" | "m11";

type GradeConfig = {
  label: string; // "9. Sınıf"
  track: "m7" | "m9" | "m10" | "m11";
  titlePrefix: string; // "9. SINIF" -- the general-exam title prefix
  courses: Course[]; // Kaynak Takibi courses
  examSubjects: MaarifExamSubject[]; // Genel Deneme (120 questions; 90 for the 7th grade, LGS-style)
  // 3 yanlış 1 doğruyu götürür (LGS) instead of TYT's 4 yanlış 1 doğru -- the 7th grade only.
  lgsStyleScoring?: boolean;
  // The grade's SÖZEL / SAYISAL sections (the 7th grade only, like LGS): the course tabs, the Genel Deneme
  // analysis tabs and the course pickers group by them. Absent = the grade's courses are one flat list.
  sectionGroups?: { key: string; label: string; courseIds: string[] }[];
  isCourseId: (id: string | null | undefined) => boolean;
  coursesForExamSubject: (key: string) => Course[];
};

export const MAARIF_GRADES: Record<MaarifGrade, GradeConfig> = {
  // 7th grade: its courses arrive course by course (lib/curriculum/maarif7.ts). Its Genel Deneme has
  // the LGS question distribution and LGS scoring.
  7: {
    label: "7. Sınıf",
    track: "m7",
    titlePrefix: "7. SINIF",
    courses: MAARIF7_KAYNAK_COURSES,
    examSubjects: MAARIF7_EXAM_SUBJECTS,
    lgsStyleScoring: true,
    sectionGroups: MAARIF7_SUBJECT_GROUPS,
    isCourseId: isMaarif7CourseId,
    coursesForExamSubject: coursesForMaarif7ExamSubject,
  },
  9: {
    label: "9. Sınıf",
    track: "m9",
    titlePrefix: "9. SINIF",
    courses: MAARIF9_KAYNAK_COURSES,
    examSubjects: MAARIF9_EXAM_SUBJECTS,
    isCourseId: isMaarif9CourseId,
    coursesForExamSubject: coursesForMaarif9ExamSubject,
  },
  10: {
    label: "10. Sınıf",
    track: "m10",
    titlePrefix: "10. SINIF",
    courses: MAARIF10_KAYNAK_COURSES,
    examSubjects: MAARIF10_EXAM_SUBJECTS,
    isCourseId: isMaarif10CourseId,
    coursesForExamSubject: coursesForMaarif10ExamSubject,
  },
  // No Kaynak Takibi / Genel Deneme curriculum data exists for 11th grade's
  // OWN courses yet (lib/curriculum/maarif11.ts's MAARIF11_KAYNAK_COURSES is
  // still an empty placeholder, same Course[] shape as 9th/10th grade's own
  // so real data can drop in later with no changes elsewhere) -- an 11th
  // grader's Kaynak Takibi instead leads with the "Maarif TYT" tab (9th+10th
  // grade merged, lib/curriculum/maarif-tyt.ts), with this grade's own
  // courses as a second "11. Sınıf" tab once they exist. Every consumer of
  // MAARIF_GRADES[grade] (course-tabs.tsx, the general-exam pickers, ...)
  // already has to handle an empty course list gracefully regardless, so an
  // 11th grader's own tab shows "nothing here yet" instead of crashing.
  11: {
    label: "11. Sınıf",
    track: "m11",
    titlePrefix: "11. SINIF",
    courses: MAARIF11_KAYNAK_COURSES,
    examSubjects: [],
    isCourseId: isMaarif11CourseId,
    coursesForExamSubject: () => [],
  },
};

export function gradeOfTrack(track: GeneralExamTrack): MaarifGrade | null {
  return track === "m7" ? 7 : track === "m9" ? 9 : track === "m10" ? 10 : track === "m11" ? 11 : null;
}

// True for an 11th grader's Genel Deneme ("11. SINIF Genel Deneme - ..."). Its
// scoring stays TYT's (every other screen reads the title as a TYT exam), so
// this is checked only where the ANALYSIS course list is chosen: it is
// recorded and shown against the merged 9th+10th "Maarif TYT" courses.
export function isMaarif11GeneralExamTitle(title: string): boolean {
  return /^11\.\s*SINIF\b/i.test(title);
}

// "9. Sınıf Matematik" -> "Matematik" (picker/chip labels).
export function stripGradePrefix(name: string): string {
  return name.replace(/^\d+\.\s*Sınıf:?\s*/i, "");
}

// A grade's courses split into its sections (SÖZEL / SAYISAL), each in its own order, or null for a grade whose
// courses are one flat list. A section with no course yet is left out.
export function maarifCourseSections(grade: MaarifGrade): { key: string; label: string; courses: Course[] }[] | null {
  const cfg = MAARIF_GRADES[grade];
  if (!cfg.sectionGroups) return null;
  return cfg.sectionGroups
    .map((g) => ({
      key: g.key,
      label: g.label,
      courses: g.courseIds.map((id) => cfg.courses.find((c) => c.id === id)).filter((c): c is Course => !!c),
    }))
    .filter((g) => g.courses.length > 0);
}

// The Ders picker options of a grade (prefix stripped): tagged with their section when the grade has sections
// (the pickers then render the two headings, as they do for LGS), plain otherwise.
export function maarifCourseOptions(grade: MaarifGrade): { id: string; label: string; group?: string }[] {
  const sections = maarifCourseSections(grade);
  if (!sections) return MAARIF_GRADES[grade].courses.map((c) => ({ id: c.id, label: stripGradePrefix(c.name) }));
  return sections.flatMap((g) => g.courses.map((c) => ({ id: c.id, label: stripGradePrefix(c.name), group: g.label })));
}

// The Ders options of an 11th grader's task form: the grade's own courses ("11. Sınıf Matematik") AND every TYT course
// ("TYT Matematik"), listed under their own headings and never merged -- both versions of a subject are assignable,
// and the prefix in each label says which one it is. A Branş Denemesi also offers the combined TYT courses.
export function maarif11CourseOptions(isBranchExam: boolean): { id: string; label: string; group: string }[] {
  const own = MAARIF_GRADES[11].courses.map((c) => ({ id: c.id, label: c.name, group: "11. Sınıf" }));
  const tyt = yksCourseOptions({
    atomic: TYT_COURSES,
    macros: isBranchExam ? TYT_BRANCH_EXAM_MACRO_COURSES : [],
    aytTrack: null,
  }).map((o) => ({ ...o, group: "TYT" }));
  return [...own, ...tyt];
}

type Flags = {
  is_maarif7?: boolean | null;
  is_maarif9?: boolean | null;
  is_maarif10?: boolean | null;
  is_maarif11?: boolean | null;
};

// Pure parse of the flag columns; null = an ordinary YKS/LGS student.
export function gradeFromFlags(flags: Flags | null | undefined): MaarifGrade | null {
  if (flags?.is_maarif11 === true) return 11;
  if (flags?.is_maarif10 === true) return 10;
  if (flags?.is_maarif9 === true) return 9;
  if (flags?.is_maarif7 === true) return 7;
  return null;
}

// The flag columns to try, newest first: a column that does not exist yet (its migration is not
// applied) makes the whole select error, so each read falls back one step at a time.
const FLAG_COLUMN_SETS = [
  "is_maarif7, is_maarif9, is_maarif10, is_maarif11",
  "is_maarif9, is_maarif10, is_maarif11",
  "is_maarif9, is_maarif10",
  "is_maarif9",
];

// Server-side read of a student's Maarif grade. Tolerant of migrations not being applied yet:
// tries every flag, then falls back a step at a time -- any other error just means "ordinary
// student", which is exactly how every pre-Maarif student behaves.
export async function fetchMaarifGrade(supabase: SupabaseClient, studentId: string): Promise<MaarifGrade | null> {
  for (const columns of FLAG_COLUMN_SETS) {
    const res = await supabase.from("profiles").select(columns).eq("id", studentId).maybeSingle();
    if (!res.error) return gradeFromFlags(res.data as Flags | null);
  }
  return null;
}

// The same tolerant read for a signup request (signup_requests.is_maarif7 / is_maarif9 /
// is_maarif10 / is_maarif11, migrations 0119 / 0097 / 0099 / 0114).
export async function fetchRequestedMaarifGrade(supabase: SupabaseClient, requestId: string): Promise<MaarifGrade | null> {
  for (const columns of FLAG_COLUMN_SETS) {
    const res = await supabase.from("signup_requests").select(columns).eq("id", requestId).maybeSingle();
    if (!res.error) return gradeFromFlags(res.data as Flags | null);
  }
  return null;
}

// Grades for many rows at once (admin lists): id -> grade, only for flagged rows. Same tolerance
// as above.
export async function fetchMaarifGradesByIds(
  supabase: SupabaseClient,
  table: "profiles" | "signup_requests",
  ids: string[],
): Promise<Map<string, MaarifGrade>> {
  const result = new Map<string, MaarifGrade>();
  if (ids.length === 0) return result;
  type Row = Flags & { id: string };
  let rows: Row[] | null = null;
  for (const columns of FLAG_COLUMN_SETS) {
    const res = await supabase.from(table).select(`id, ${columns}`).in("id", ids);
    if (!res.error) {
      rows = res.data as unknown as Row[];
      break;
    }
  }
  for (const r of rows ?? []) {
    const grade = gradeFromFlags(r);
    if (grade !== null) result.set(r.id, grade);
  }
  return result;
}

// Whether the student is currently flagged 7th grade. Tolerant of migration 0119 not being applied
// (no column = not a 7th grader), so a caller can include is_maarif7 in a write only when it matters.
export async function fetchIsMaarif7(supabase: SupabaseClient, studentId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("is_maarif7").eq("id", studentId).maybeSingle();
  if (error) return false;
  return (data as { is_maarif7?: boolean } | null)?.is_maarif7 === true;
}
