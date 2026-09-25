import type { SupabaseClient } from "@supabase/supabase-js";

import type { Course } from "./curriculum";
import { MAARIF9_KAYNAK_COURSES, isMaarif9CourseId } from "./curriculum/maarif9";
import { MAARIF10_KAYNAK_COURSES, isMaarif10CourseId } from "./curriculum/maarif10";
import {
  MAARIF9_EXAM_SUBJECTS,
  MAARIF10_EXAM_SUBJECTS,
  coursesForMaarif9ExamSubject,
  coursesForMaarif10ExamSubject,
} from "./curriculum/subject-groups";

// Maarif ("Türkiye Yüzyılı") grades a student can be flagged with:
// profiles.is_maarif9 (0096) or profiles.is_maarif10 (0099) -- mutually
// exclusive (a CHECK constraint enforces it). Everything that picks WHICH
// curriculum a student sees goes through this one table, so the two grades
// can never leak into each other: a 9th grader is only ever offered the 9th
// grade's courses/subjects, a 10th grader only the 10th's.
export type MaarifGrade = 9 | 10;

export type MaarifExamSubject = { key: string; label: string; section: string; courseIds: string[]; questions: number };

export type GeneralExamTrack = "tyt" | "ayt" | "lgs" | "m9" | "m10";

type GradeConfig = {
  label: string; // "9. Sınıf"
  track: "m9" | "m10";
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
};

export function gradeOfTrack(track: GeneralExamTrack): MaarifGrade | null {
  return track === "m9" ? 9 : track === "m10" ? 10 : null;
}

// "9. Sınıf Matematik" -> "Matematik" (picker/chip labels).
export function stripGradePrefix(name: string): string {
  return name.replace(/^\d+\.\s*Sınıf:?\s*/i, "");
}

// Pure parse of the flag columns; null = an ordinary YKS/LGS student.
export function gradeFromFlags(flags: { is_maarif9?: boolean | null; is_maarif10?: boolean | null } | null | undefined): MaarifGrade | null {
  if (flags?.is_maarif10 === true) return 10;
  if (flags?.is_maarif9 === true) return 9;
  return null;
}

// Server-side read of a student's Maarif grade. Tolerant of migrations not
// being applied yet: if is_maarif10 does not exist (0099 pending) it falls
// back to is_maarif9 alone; any other error just means "ordinary student",
// which is exactly how every pre-Maarif student behaves.
export async function fetchMaarifGrade(supabase: SupabaseClient, studentId: string): Promise<MaarifGrade | null> {
  const both = await supabase.from("profiles").select("is_maarif9, is_maarif10").eq("id", studentId).maybeSingle();
  if (!both.error) return gradeFromFlags(both.data as { is_maarif9?: boolean; is_maarif10?: boolean } | null);
  const nine = await supabase.from("profiles").select("is_maarif9").eq("id", studentId).maybeSingle();
  if (nine.error) return null;
  return gradeFromFlags(nine.data as { is_maarif9?: boolean } | null);
}

// The same tolerant read for a signup request (signup_requests.is_maarif9 /
// is_maarif10, migrations 0097 / 0099).
export async function fetchRequestedMaarifGrade(supabase: SupabaseClient, requestId: string): Promise<MaarifGrade | null> {
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
  type Row = { id: string; is_maarif9?: boolean; is_maarif10?: boolean };
  let rows: Row[] | null = null;
  const both = await supabase.from(table).select("id, is_maarif9, is_maarif10").in("id", ids);
  if (!both.error) {
    rows = both.data as Row[];
  } else {
    const nine = await supabase.from(table).select("id, is_maarif9").in("id", ids);
    if (!nine.error) rows = nine.data as Row[];
  }
  for (const r of rows ?? []) {
    const grade = gradeFromFlags(r);
    if (grade !== null) result.set(r.id, grade);
  }
  return result;
}
