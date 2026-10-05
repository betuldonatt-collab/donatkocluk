"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dbError } from "@/lib/errors";
import { fetchIsGraduate } from "@/lib/graduate";
import { assertNotImpersonating } from "@/lib/impersonation";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { defaultCourseName, isDefaultCourseKey, schoolCohortOf, type SchoolCohort } from "@/lib/school-exams";
import { createClient } from "@/lib/supabase/server";
import { parseInput, uuidSchema } from "@/lib/validation";

// The coach edits a student's school-exam grades (Yazılılar tab on the student's page) and locks single grades
// so the student can no longer change them. Every action returns a result instead of throwing (a thrown message
// becomes the opaque "Minified React error #441" in production). The coach_students link is re-checked here and
// again by the tables' policies and the lock trigger (migration 0120). Removal requests keep using
// decideCourseRemoval (./school-exam-actions.ts).

export type SchoolGradeResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

class UserError extends Error {}

const MIGRATION_HINT = "Bu özellik için veritabanı güncellemesi (0120) uygulanmalı.";
const NOTHING_TO_LOCK = "Önce bir not girmelisin; yalnızca girilmiş not kilitlenebilir.";

const cellSchema = z.object({
  studentId: uuidSchema,
  courseKey: z.string().trim().min(1).max(60),
  term: z.union([z.literal(1), z.literal(2)]),
  examNo: z.union([z.literal(1), z.literal(2)]),
});

type CoachCtx = { supabase: Awaited<ReturnType<typeof createClient>>; studentId: string; cohort: SchoolCohort };

async function loadCoachContext(studentIdRaw: string): Promise<CoachCtx> {
  await assertNotImpersonating();
  const studentId = parseInput(uuidSchema, studentIdRaw);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UserError("Oturum bulunamadı.");
  const { data: link } = await supabase.from("coach_students").select("student_id").eq("coach_id", user.id).eq("student_id", studentId).maybeSingle();
  if (!link) throw new UserError("Bu öğrenci sana atanmamış.");
  const { data: profile } = await supabase.from("profiles").select("exam_type").eq("id", studentId).maybeSingle();
  const cohort = schoolCohortOf({
    examType: profile?.exam_type === "LGS" ? "LGS" : "YKS",
    maarifGrade: await fetchMaarifGrade(supabase, studentId),
    isGraduate: await fetchIsGraduate(supabase, studentId),
  });
  if (!cohort) throw new UserError("Mezun öğrencilerin yazılı notları yok.");
  return { supabase, studentId, cohort };
}

async function runCoach<T>(label: string, studentId: unknown, fn: (ctx: CoachCtx) => Promise<T>): Promise<SchoolGradeResult<T>> {
  try {
    return { ok: true, data: await fn(await loadCoachContext(String(studentId))) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(`[school-grade-actions:${label}] failed:`, e);
    return { ok: false, error: e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene." };
  }
}

// A write refused because the 0120 policies / column are not there yet gets the hint; anything else the usual
// sanitised error.
function writeError(error: { code?: string; message?: string }): Error {
  if (error.code === "42501" || error.code === "42703" || error.code === "PGRST204" || error.message?.includes("is_locked")) {
    return new UserError(MIGRATION_HINT);
  }
  return dbError(error);
}

// The student's row for one of their grade's default courses, created on first use (the coach may enter a grade
// the student never touched); a custom course must already exist. A removed course cannot be written to.
async function ensureStudentCourse({ supabase, studentId, cohort }: CoachCtx, courseKey: string): Promise<{ id: string }> {
  const { data: existing, error } = await supabase
    .from("student_school_courses")
    .select("id, removed_at")
    .eq("student_id", studentId)
    .eq("course_key", courseKey)
    .maybeSingle();
  if (error) throw dbError(error);
  if (existing) {
    if (existing.removed_at) throw new UserError("Bu ders kaldırıldı.");
    return { id: existing.id as string };
  }
  const name = defaultCourseName(cohort, courseKey);
  if (!isDefaultCourseKey(cohort, courseKey) || !name) throw new UserError("Bu ders öğrencinin sınıfında yok.");
  const { data: created, error: insertError } = await supabase
    .from("student_school_courses")
    .insert({ student_id: studentId, course_key: courseKey, is_custom: false, name })
    .select("id")
    .single();
  if (insertError) throw writeError(insertError);
  return { id: created.id as string };
}

const saveSchema = cellSchema.extend({
  // 0-100, at most two decimals; null clears the box.
  value: z
    .number()
    .min(0, "Not 0 ile 100 arasında olmalı.")
    .max(100, "Not 0 ile 100 arasında olmalı.")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "En fazla iki ondalık yazılabilir.")
    .nullable(),
});

// Enter / change / clear (null) one grade. A locked grade can still be edited by the coach and stays locked;
// clearing a grade removes it together with its lock.
export async function saveSchoolGradeForStudent(input: z.input<typeof saveSchema>): Promise<SchoolGradeResult<{ courseId: string; locked: boolean }>> {
  return runCoach("saveSchoolGradeForStudent", input?.studentId, async (ctx) => {
    const v = parseInput(saveSchema, input);
    const course = await ensureStudentCourse(ctx, v.courseKey);
    if (v.value === null) {
      const { error } = await ctx.supabase.from("student_school_grades").delete().eq("course_id", course.id).eq("term", v.term).eq("exam_no", v.examNo);
      if (error) throw writeError(error);
      revalidatePath("/student/yazililar");
      return { courseId: course.id, locked: false };
    }
    // Best-effort read of the lock (before 0120 the column does not exist and nothing is locked).
    const { data: existing } = await ctx.supabase
      .from("student_school_grades")
      .select("is_locked")
      .eq("course_id", course.id)
      .eq("term", v.term)
      .eq("exam_no", v.examNo)
      .maybeSingle();
    const { error } = await ctx.supabase.from("student_school_grades").upsert(
      { course_id: course.id, student_id: ctx.studentId, term: v.term, exam_no: v.examNo, grade: v.value, updated_at: new Date().toISOString() },
      { onConflict: "course_id,term,exam_no" },
    );
    if (error) throw writeError(error);
    revalidatePath("/student/yazililar");
    return { courseId: course.id, locked: (existing as { is_locked?: boolean } | null)?.is_locked === true };
  });
}

const lockSchema = cellSchema.extend({ locked: z.boolean() });

// Lock / unlock one saved grade (course + term + yazılı). The student cannot edit a locked grade; every other
// grade stays open to both.
export async function setSchoolGradeLock(input: z.input<typeof lockSchema>): Promise<SchoolGradeResult<{ locked: boolean }>> {
  return runCoach("setSchoolGradeLock", input?.studentId, async (ctx) => {
    const v = parseInput(lockSchema, input);
    const { data: course, error: courseError } = await ctx.supabase
      .from("student_school_courses")
      .select("id")
      .eq("student_id", ctx.studentId)
      .eq("course_key", v.courseKey)
      .is("removed_at", null)
      .maybeSingle();
    if (courseError) throw dbError(courseError);
    if (!course) throw new UserError(NOTHING_TO_LOCK);
    const { data, error } = await ctx.supabase
      .from("student_school_grades")
      .update({ is_locked: v.locked })
      .eq("course_id", course.id)
      .eq("term", v.term)
      .eq("exam_no", v.examNo)
      .select("id");
    if (error) throw writeError(error);
    if (!data || data.length === 0) throw new UserError(NOTHING_TO_LOCK);
    revalidatePath("/student/yazililar");
    return { locked: v.locked };
  });
}
