"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dbError } from "@/lib/errors";
import { assertNotImpersonating } from "@/lib/impersonation";
import { createClient } from "@/lib/supabase/server";
import { parseInput, uuidSchema } from "@/lib/validation";

// "Ders Silme Talepleri": a student asked to drop a default school course ("bu dersi
// almıyorum", Yazılılar). Nothing is removed until their coach approves. Same shape as the
// other coach review panels: a best-effort read for the dashboard, and a decision action
// that returns a result instead of throwing.

export type PendingCourseRemoval = {
  courseId: string;
  studentId: string;
  studentName: string | null;
  courseName: string;
  requestedAt: string | null;
};

// Best-effort (it feeds the dashboard): a failure -- e.g. migration 0118 not applied yet --
// returns [] instead of taking the page down.
export async function getPendingCourseRemovals(): Promise<PendingCourseRemoval[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: links } = await supabase.from("coach_students").select("student_id").eq("coach_id", user.id);
    const studentIds = (links ?? []).map((l) => l.student_id as string);
    if (studentIds.length === 0) return [];

    const [{ data: rows, error }, { data: profiles }] = await Promise.all([
      supabase
        .from("student_school_courses")
        .select("id, student_id, name, removal_requested_at")
        .in("student_id", studentIds)
        .eq("removal_status", "pending")
        .is("removed_at", null)
        .order("removal_requested_at", { ascending: true }),
      supabase.from("profiles").select("id, full_name").in("id", studentIds),
    ]);
    if (error) {
      console.error("[getPendingCourseRemovals] failed:", error);
      return [];
    }
    const nameById = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]));
    return (rows ?? []).map((r) => ({
      courseId: r.id as string,
      studentId: r.student_id as string,
      studentName: nameById.get(r.student_id as string) ?? null,
      courseName: r.name as string,
      requestedAt: (r.removal_requested_at as string | null) ?? null,
    }));
  } catch (e) {
    console.error("[getPendingCourseRemovals] failed:", e);
    return [];
  }
}

const decisionSchema = z.enum(["approve", "reject"]);

export type CourseRemovalDecisionResult = { ok: true; decision: "approve" | "reject" } | { ok: false; error: string };

// Approve: the course is removed for good (hidden; its grades stay in the database).
// Reject: the student is told no and may ask again. Double-layer authorization: the
// coach_students link is checked here and again by the table's policy + trigger.
export async function decideCourseRemoval(courseId: string, decision: "approve" | "reject"): Promise<CourseRemovalDecisionResult> {
  try {
    await assertNotImpersonating();
    const id = parseInput(uuidSchema, courseId);
    const decisionV = parseInput(decisionSchema, decision);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Oturum bulunamadı." };

    const { data: course, error: fetchError } = await supabase
      .from("student_school_courses")
      .select("student_id, removal_status, removed_at")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw dbError(fetchError);
    if (!course || course.removal_status !== "pending" || course.removed_at) {
      return { ok: false, error: "Bu talep zaten işlenmiş." };
    }
    const { data: link } = await supabase
      .from("coach_students")
      .select("student_id")
      .eq("coach_id", user.id)
      .eq("student_id", course.student_id)
      .maybeSingle();
    if (!link) return { ok: false, error: "Bu öğrenci sana atanmamış." };

    const patch =
      decisionV === "approve"
        ? { removal_status: "none", removed_at: new Date().toISOString() }
        : { removal_status: "rejected" };
    const { error } = await supabase.from("student_school_courses").update(patch).eq("id", id).eq("removal_status", "pending");
    if (error) throw dbError(error);
    revalidatePath("/coach/dashboard");
    return { ok: true, decision: decisionV };
  } catch (e) {
    console.error("[decideCourseRemoval] failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Kaydedilemedi, tekrar dene." };
  }
}
