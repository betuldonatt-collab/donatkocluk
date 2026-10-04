"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { dbError } from "@/lib/errors";
import { fetchIsGraduate } from "@/lib/graduate";
import { assertNotImpersonating } from "@/lib/impersonation";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import {
  checkCourseName,
  defaultCourseName,
  isDefaultCourseKey,
  isSchoolColorKey,
  MAX_CUSTOM_COURSES,
  schoolCohortOf,
  type SchoolCohort,
} from "@/lib/school-exams";
import { createClient } from "@/lib/supabase/server";
import { parseInput, uuidSchema } from "@/lib/validation";

// Every action here returns a result instead of throwing: a thrown message is replaced by
// the opaque "Minified React error #441" in production (see lib/friendly-error.ts), and
// these run from event handlers whose reason the student needs to read.
export type YazililarResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const courseKeySchema = z.string().trim().min(1).max(60);

type Ctx = { supabase: SupabaseClient; userId: string; cohort: SchoolCohort };

class UserError extends Error {}

async function loadContext(): Promise<Ctx> {
  await assertNotImpersonating();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UserError("Oturum bulunamadı.");
  const { data: profile } = await supabase.from("profiles").select("exam_type").eq("id", user.id).maybeSingle();
  const cohort = schoolCohortOf({
    examType: profile?.exam_type === "LGS" ? "LGS" : "YKS",
    maarifGrade: await fetchMaarifGrade(supabase, user.id),
    isGraduate: await fetchIsGraduate(supabase, user.id),
  });
  if (!cohort) throw new UserError("Yazılılar mezunlar için açık değil.");
  return { supabase, userId: user.id, cohort };
}

async function run<T>(label: string, fn: (ctx: Ctx) => Promise<T>): Promise<YazililarResult<T>> {
  try {
    const ctx = await loadContext();
    return { ok: true, data: await fn(ctx) };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error(`[yazililar:${label}] failed:`, e);
    return { ok: false, error: e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene." };
  }
}

type CourseRow = { id: string; course_key: string; is_custom: boolean; removal_status: string; removed_at: string | null };

// The student's row for a course, created on first use for a default course of THEIR grade.
// A custom course must already exist. A course the coach removed cannot be touched.
async function ensureCourse({ supabase, userId, cohort }: Ctx, courseKey: string): Promise<CourseRow> {
  const { data: existing, error } = await supabase
    .from("student_school_courses")
    .select("id, course_key, is_custom, removal_status, removed_at")
    .eq("student_id", userId)
    .eq("course_key", courseKey)
    .maybeSingle();
  if (error) throw dbError(error);
  if (existing) {
    if (existing.removed_at) throw new UserError("Bu ders kaldırıldı.");
    return existing as CourseRow;
  }
  const name = defaultCourseName(cohort, courseKey);
  if (!isDefaultCourseKey(cohort, courseKey) || !name) throw new UserError("Bu ders sınıfında yok.");
  const { data: created, error: insertError } = await supabase
    .from("student_school_courses")
    .insert({ student_id: userId, course_key: courseKey, is_custom: false, name })
    .select("id, course_key, is_custom, removal_status, removed_at")
    .single();
  if (insertError) throw dbError(insertError);
  return created as CourseRow;
}

const saveGradeSchema = z.object({
  courseKey: courseKeySchema,
  term: z.union([z.literal(1), z.literal(2)]),
  examNo: z.union([z.literal(1), z.literal(2)]),
  // 0-100, at most two decimals; null clears the box.
  value: z
    .number()
    .min(0, "Not 0 ile 100 arasında olmalı.")
    .max(100, "Not 0 ile 100 arasında olmalı.")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "En fazla iki ondalık yazılabilir.")
    .nullable(),
});

export async function saveSchoolGrade(input: z.input<typeof saveGradeSchema>): Promise<YazililarResult<{ courseId: string }>> {
  return run("saveSchoolGrade", async (ctx) => {
    const v = parseInput(saveGradeSchema, input);
    const course = await ensureCourse(ctx, v.courseKey);
    if (v.value === null) {
      const { error } = await ctx.supabase
        .from("student_school_grades")
        .delete()
        .eq("course_id", course.id)
        .eq("term", v.term)
        .eq("exam_no", v.examNo);
      if (error) throw dbError(error);
    } else {
      const { error } = await ctx.supabase.from("student_school_grades").upsert(
        { course_id: course.id, student_id: ctx.userId, term: v.term, exam_no: v.examNo, grade: v.value, updated_at: new Date().toISOString() },
        { onConflict: "course_id,term,exam_no" },
      );
      if (error) throw dbError(error);
    }
    return { courseId: course.id };
  });
}

const colorSchema = z.string().refine(isSchoolColorKey, "Geçersiz renk.");

export async function setSchoolCourseColor(input: { courseKey: string; color: string }): Promise<YazililarResult<{ courseId: string }>> {
  return run("setSchoolCourseColor", async (ctx) => {
    const courseKey = parseInput(courseKeySchema, input.courseKey);
    const color = parseInput(colorSchema, input.color);
    const course = await ensureCourse(ctx, courseKey);
    const { error } = await ctx.supabase.from("student_school_courses").update({ color }).eq("id", course.id);
    if (error) throw dbError(error);
    return { courseId: course.id };
  });
}

export type CustomCourseRow = { id: string; course_key: string; name: string; color: string | null };

export async function addCustomSchoolCourse(input: { name: string; color: string }): Promise<YazililarResult<CustomCourseRow>> {
  return run("addCustomSchoolCourse", async (ctx) => {
    const checked = checkCourseName(input.name);
    if (!checked.ok) throw new UserError(checked.error);
    const color = parseInput(colorSchema, input.color);
    const { data: existing, error: countError } = await ctx.supabase
      .from("student_school_courses")
      .select("sort_order")
      .eq("student_id", ctx.userId)
      .eq("is_custom", true);
    if (countError) throw dbError(countError);
    if ((existing ?? []).length >= MAX_CUSTOM_COURSES) throw new UserError(`En fazla ${MAX_CUSTOM_COURSES} özel ders ekleyebilirsin.`);
    const sortOrder = Math.max(0, ...(existing ?? []).map((r) => Number(r.sort_order) || 0)) + 1;
    const { data, error } = await ctx.supabase
      .from("student_school_courses")
      .insert({ student_id: ctx.userId, course_key: `custom-${randomUUID()}`, is_custom: true, name: checked.name, color, sort_order: sortOrder })
      .select("id, course_key, name, color")
      .single();
    if (error) throw dbError(error);
    revalidatePath("/student/yazililar");
    return data as CustomCourseRow;
  });
}

export async function renameCustomSchoolCourse(input: { courseId: string; name: string }): Promise<YazililarResult<{ name: string }>> {
  return run("renameCustomSchoolCourse", async (ctx) => {
    const courseId = parseInput(uuidSchema, input.courseId);
    const checked = checkCourseName(input.name);
    if (!checked.ok) throw new UserError(checked.error);
    const { data, error } = await ctx.supabase
      .from("student_school_courses")
      .update({ name: checked.name })
      .eq("id", courseId)
      .eq("student_id", ctx.userId)
      .eq("is_custom", true)
      .select("id")
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new UserError("Ders bulunamadı.");
    return { name: checked.name };
  });
}

// A course the student made themselves goes straight away (its grades with it).
export async function deleteCustomSchoolCourse(courseId: string): Promise<YazililarResult> {
  return run("deleteCustomSchoolCourse", async (ctx) => {
    const id = parseInput(uuidSchema, courseId);
    const { error } = await ctx.supabase.from("student_school_courses").delete().eq("id", id).eq("student_id", ctx.userId).eq("is_custom", true);
    if (error) throw dbError(error);
    revalidatePath("/student/yazililar");
  });
}

// "Bu dersi almıyorum" on a DEFAULT course: asks the coach; nothing is removed until they approve.
export async function requestSchoolCourseRemoval(courseKey: string): Promise<YazililarResult> {
  return run("requestSchoolCourseRemoval", async (ctx) => {
    const key = parseInput(courseKeySchema, courseKey);
    const course = await ensureCourse(ctx, key);
    if (course.is_custom) throw new UserError("Kendi eklediğin dersi doğrudan silebilirsin.");
    if (course.removal_status === "pending") return;
    const { error } = await ctx.supabase
      .from("student_school_courses")
      .update({ removal_status: "pending", removal_requested_at: new Date().toISOString() })
      .eq("id", course.id)
      .eq("student_id", ctx.userId);
    if (error) throw dbError(error);
  });
}

export async function cancelSchoolCourseRemoval(courseKey: string): Promise<YazililarResult> {
  return run("cancelSchoolCourseRemoval", async (ctx) => {
    const key = parseInput(courseKeySchema, courseKey);
    const { error } = await ctx.supabase
      .from("student_school_courses")
      .update({ removal_status: "none", removal_requested_at: null })
      .eq("student_id", ctx.userId)
      .eq("course_key", key)
      .eq("removal_status", "pending");
    if (error) throw dbError(error);
  });
}
