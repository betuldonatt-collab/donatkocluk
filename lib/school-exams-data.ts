import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchIsGraduate } from "@/lib/graduate";
import type { MaarifGrade } from "@/lib/maarif-grade";
import {
  DEFAULT_SCHOOL_COURSES,
  schoolCohortOf,
  type ExamNo,
  type RemovalStatus,
  type SchoolCohort,
  type SchoolCourseDef,
  type StoredSchoolCourse,
  type StoredSchoolGrade,
  type Term,
} from "@/lib/school-exams";

// A student's Yazılılar (school exam grades), as the coach (editable) and the parent (read-only) see them.
// The coach_students link is what the tables' own policies check (migration 0118), so a coach only ever
// gets rows of students on their roster.
export type SchoolExamsData = {
  cohort: SchoolCohort;
  defaults: SchoolCourseDef[];
  courses: StoredSchoolCourse[];
  grades: StoredSchoolGrade[];
  // false when the tables could not be read (migration 0118 not applied yet): the tab then says so calmly.
  ready: boolean;
};

// null for a graduate (Mezun): they take no school exams, so there is no Yazılılar tab. Never throws -- this
// feeds a tab of a page that must keep working without it.
export async function fetchSchoolExams(
  supabase: SupabaseClient,
  studentId: string,
  student: { examType: "YKS" | "LGS"; maarifGrade: MaarifGrade | null },
): Promise<SchoolExamsData | null> {
  const isGraduate = await fetchIsGraduate(supabase, studentId);
  const cohort = schoolCohortOf({ examType: student.examType, maarifGrade: student.maarifGrade, isGraduate });
  if (!cohort) return null;
  const base = { cohort, defaults: DEFAULT_SCHOOL_COURSES[cohort], courses: [], grades: [] };

  try {
    // is_locked exists from migration 0120; before it is applied the grades are read without it (all unlocked).
    const readGrades = async () => {
      const withLock = await supabase.from("student_school_grades").select("course_id, term, exam_no, grade, is_locked").eq("student_id", studentId);
      if (!withLock.error) return withLock;
      return supabase.from("student_school_grades").select("course_id, term, exam_no, grade").eq("student_id", studentId);
    };
    const [courseRes, gradeRes] = await Promise.all([
      supabase
        .from("student_school_courses")
        .select("id, course_key, is_custom, name, color, sort_order, removal_status, removed_at")
        .eq("student_id", studentId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      readGrades(),
    ]);
    if (courseRes.error || gradeRes.error) {
      console.error("[fetchSchoolExams] read failed:", courseRes.error ?? gradeRes.error);
      return { ...base, ready: false };
    }
    return {
      ...base,
      ready: true,
      courses: (courseRes.data ?? []).map((c) => ({
        id: c.id as string,
        key: c.course_key as string,
        isCustom: c.is_custom as boolean,
        name: c.name as string,
        color: (c.color as string | null) ?? null,
        removalStatus: c.removal_status as RemovalStatus,
        removed: c.removed_at !== null,
      })),
      grades: (gradeRes.data ?? []).map((g) => ({
        courseId: g.course_id as string,
        term: g.term as Term,
        examNo: g.exam_no as ExamNo,
        grade: Number(g.grade),
        locked: (g as { is_locked?: boolean }).is_locked === true,
      })),
    };
  } catch (e) {
    console.error("[fetchSchoolExams] failed:", e);
    return { ...base, ready: false };
  }
}
