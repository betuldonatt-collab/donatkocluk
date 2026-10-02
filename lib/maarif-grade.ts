import type { SupabaseClient } from "@supabase/supabase-js";

import type { Course } from "./curriculum";
import { MAARIF9_KAYNAK_COURSES, isMaarif9CourseId } from "./curriculum/maarif9";
import { MAARIF10_KAYNAK_COURSES, isMaarif10CourseId } from "./curriculum/maarif10";
import { MAARIF11_KAYNAK_COURSES, isMaarif11CourseId } from "./curriculum/maarif11";
import {
  MAARIF9_EXAM_SUBJECTS,
  MAARIF10_EXAM_SUBJECTS,
  coursesForMaarif9ExamSubject,
  coursesForMaarif10ExamSubject,
} from "./curriculum/subject-groups";

// Maarif ("Türkiye Yüzyılı") grades a student can be flagged with:
// profiles.is_maarif9 (0096), is_maarif10 (0099) or is_maarif11 (0114) --
// pairwise mutually exclusive (a CHECK constraint enforces it). Everything
// that picks WHICH curriculum a student sees goes through this one table,
// so grades can never leak into each other: a 9th grader is only ever
// offered the 9th grade's courses/subjects, and so on.
export type MaarifGrade = 9 | 10 | 11;

export type MaarifExamSubject = { key: string; label: string; section: string; courseIds: string[]; questions: number };

export type GeneralExamTrack = "tyt" | "ayt" | "lgs" | "m9" | "m10" | "m11";

type GradeConfig = {
  label: string; // "9. Sınıf"
  track: "m9" | "m10" | "m11";
  titlePrefix: string; // "9. SINIF" -- the general-exam title prefix
  courses: Course[]; // Kaynak Takibi courses
  examSubjects: MaarifExamSubject[]; // Genel Deneme, 120 questions
  isCourseId: (id: string | null | undefined) => boolean;
  coursesForExamSubject: (key: string) => Course[];
};

export const MAARIF_GRADES: Record<MaarifGrade, GradeConfig> = {
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
  return track === "m9" ? 9 : track === "m10" ? 10 : track === "m11" ? 11 : null;
}

// "9. Sınıf Matematik" -> "Matematik" (picker/chip labels).
export function stripGradePrefix(name: string): string {
  return name.replace(/^\d+\.\s*Sınıf:?\s*/i, "");
}

// Pure parse of the flag columns; null = an ordinary YKS/LGS student.
export function gradeFromFlags(
  flags: { is_maarif9?: boolean | null; is_maarif10?: boolean | null; is_maarif11?: boolean | null } | null | undefined,
): MaarifGrade | null {
  if (flags?.is_maarif11 === true) return 11;
  if (flags?.is_maarif10 === true) return 10;
  if (flags?.is_maarif9 === true) return 9;
  return null;
}

// Server-side read of a student's Maarif grade. Tolerant of migrations not
// being applied yet: tries all three flags, then falls back a step at a
// time (is_maarif9/10, then is_maarif9 alone) if a column doesn't exist
// yet -- any other error just means "ordinary student", which is exactly
// how every pre-Maarif student behaves.
export async function fetchMaarifGrade(supabase: SupabaseClient, studentId: string): Promise<MaarifGrade | null> {
  const all = await supabase.from("profiles").select("is_maarif9, is_maarif10, is_maarif11").eq("id", studentId).maybeSingle();
  if (!all.error) return gradeFromFlags(all.data as { is_maarif9?: boolean; is_maarif10?: boolean; is_maarif11?: boolean } | null);
  const both = await supabase.from("profiles").select("is_maarif9, is_maarif10").eq("id", studentId).maybeSingle();
  if (!both.error) return gradeFromFlags(both.data as { is_maarif9?: boolean; is_maarif10?: boolean } | null);
  const nine = await supabase.from("profiles").select("is_maarif9").eq("id", studentId).maybeSingle();
  if (nine.error) return null;
  return gradeFromFlags(nine.data as { is_maarif9?: boolean } | null);
}

// The same tolerant read for a signup request (signup_requests.is_maarif9 /
// is_maarif10 / is_maarif11, migrations 0097 / 0099 / 0114).
export async function fetchRequestedMaarifGrade(supabase: SupabaseClient, requestId: string): Promise<MaarifGrade | null> {
  const all = await supabase.from("signup_requests").select("is_maarif9, is_maarif10, is_maarif11").eq("id", requestId).maybeSingle();
  if (!all.error) return gradeFromFlags(all.data as { is_maarif9?: boolean; is_maarif10?: boolean; is_maarif11?: boolean } | null);
  const both = await supabase.from("signup_requests").select("is_maarif9, is_maarif10").eq("id", requestId).maybeSingle();
  if (!both.error) return gradeFromFlags(both.data as { is_maarif9?: boolean; is_maarif10?: boolean } | null);
  const nine = await supabase.from("signup_requests").select("is_maarif9").eq("id", requestId).maybeSingle();
  if (nine.error) return null;
  return gradeFromFlags(nine.data as { is_maarif9?: boolean } | null);
}

// Grades for many rows at once (admin lists): id -> grade, only for flagged
// rows. Same tolerance as above.
export async function fetchMaarifGradesByIds(
  supabase: SupabaseClient,
  table: "profiles" | "signup_requests",
  ids: string[],
): Promise<Map<string, MaarifGrade>> {
  const result = new Map<string, MaarifGrade>();
  if (ids.length === 0) return result;
  type Row = { id: string; is_maarif9?: boolean; is_maarif10?: boolean; is_maarif11?: boolean };
  let rows: Row[] | null = null;
  const all = await supabase.from(table).select("id, is_maarif9, is_maarif10, is_maarif11").in("id", ids);
  if (!all.error) {
    rows = all.data as Row[];
  } else {
    const both = await supabase.from(table).select("id, is_maarif9, is_maarif10").in("id", ids);
    if (!both.error) {
      rows = both.data as Row[];
    } else {
      const nine = await supabase.from(table).select("id, is_maarif9").in("id", ids);
      if (!nine.error) rows = nine.data as Row[];
    }
  }
  for (const r of rows ?? []) {
    const grade = gradeFromFlags(r);
    if (grade !== null) result.set(r.id, grade);
  }
  return result;
}
