"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { fetchMaarifGrade } from "@/lib/maarif-grade";
import { GENERIC_DB_ERROR, dbError } from "@/lib/errors";
import { nonEmptyText, parseInput, uuidSchema } from "@/lib/validation";
import {
  PIPELINE_CONFIG,
  pipelineStepSchema,
  validatePipelineStep,
  type PipelineActionResult,
  type PipelineStepInput,
} from "@/lib/topic-pipeline";

// courseId is a curriculum slug (e.g. "tyt-turkce"), never a UUID -- see
// addOwnBranchExamResource below, which already validated this
// correctly. This one used uuidSchema, so every call rejected with
// "Geçersiz kimlik." before ever reaching the insert -- the actual root
// cause of "the add button fails silently": the dialog closed
// optimistically (see kaynak-takibi-client.tsx) before this error ever
// had anywhere to surface.
const courseIdSchema = z.string().trim().max(60);

export async function addResource(courseId: string, name: string) {
  await assertNotImpersonating();
  const courseIdV = parseInput(courseIdSchema, courseId);
  const nameV = parseInput(nonEmptyText(200, "Kaynak adı"), name);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { data, error } = await supabase
    .from("student_resources")
    .insert({ student_id: user.id, course_id: courseIdV, name: nameV })
    .select("id, name")
    .single();

  if (error) throw dbError(error);

  revalidatePath("/student/kaynak-takibi");
  return data as { id: string; name: string };
}

// Same courseId fix as addResource above, plus topicId -- both are
// curriculum slugs (e.g. "tyt-turkce-u0-t0"), never UUIDs. resourceId is
// the one genuine UUID here (a real student_resources row id). This
// schema being wrong on two of its three id fields meant every solved/
// reviewed checkbox toggle has been rejecting silently (fire-and-forget
// void call, no error surfaced) and never actually persisting.
const toggleProgressSchema = z.object({
  courseId: courseIdSchema,
  topicId: z.string().trim().max(80),
  resourceId: uuidSchema,
  solved: z.boolean(),
  reviewed: z.boolean(),
});

export async function toggleResourceProgress(input: {
  courseId: string;
  topicId: string;
  resourceId: string;
  solved: boolean;
  reviewed: boolean;
}) {
  await assertNotImpersonating();
  const inputV = parseInput(toggleProgressSchema, input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("student_resource_progress").upsert(
    {
      student_id: user.id,
      course_id: inputV.courseId,
      topic_id: inputV.topicId,
      resource_id: inputV.resourceId,
      solved: inputV.solved,
      reviewed: inputV.reviewed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,topic_id,resource_id" },
  );

  if (error) throw dbError(error);

  revalidatePath("/student/kaynak-takibi");
}

// Self-managed branch-trial creation -- a student can add their own
// branch-trial resource straight to the library, same as a coach can
// (app/coach/actions.ts's addBranchExamResource). RLS already allows
// this: student_resources_own_insert has no column restriction, and the
// stock-tampering guard trigger only fires on UPDATE, not INSERT -- so
// no migration was needed for this, only the app-layer action + UI.
export async function addOwnBranchExamResource(courseId: string, name: string, totalStock: number, remainingStock: number) {
  await assertNotImpersonating();
  const courseIdV = parseInput(z.string().trim().max(60), courseId);
  const nameV = parseInput(nonEmptyText(300, "Kaynak adı"), name);
  const totalStockV = parseInput(z.number().int().min(0), totalStock);
  const remainingStockV = parseInput(z.number().int().min(0), remainingStock);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { data, error } = await supabase
    .from("student_resources")
    .insert({
      student_id: user.id,
      course_id: courseIdV,
      name: nameV,
      kind: "branch_exam",
      total_stock: totalStockV,
      remaining_stock: remainingStockV,
    })
    .select("id, name, total_stock, remaining_stock")
    .single();

  if (error) throw dbError(error);

  revalidatePath("/student/kaynak-takibi");
  return data as { id: string; name: string; total_stock: number; remaining_stock: number };
}

// Self-managed branch-trial stock (0045) -- sets both counts directly
// (not delta-based like the coach's updateBranchExamStock), scoped to the
// caller's own row via .eq("student_id", user.id); the DB guard trigger
// (prevent_student_resource_stock_tampering) is the real boundary.
export async function updateOwnBranchExamStock(resourceId: string, totalStock: number, remainingStock: number) {
  await assertNotImpersonating();
  const resourceIdV = parseInput(uuidSchema, resourceId);
  const totalStockV = parseInput(z.number().int().min(0), totalStock);
  const remainingStockV = parseInput(z.number().int().min(0), remainingStock);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase
    .from("student_resources")
    .update({ total_stock: totalStockV, remaining_stock: remainingStockV })
    .eq("id", resourceIdV)
    .eq("student_id", user.id);

  if (error) throw dbError(error);

  revalidatePath("/student/kaynak-takibi");
}

// Per-topic pipeline checkbox on the Kaynak Takibi table: tick / untick one
// step. LGS students write lgs_topic_pipeline_status (4 steps), YKS students
// yks_topic_pipeline_status (2 steps) -- the table and the legal steps come
// from the student's own cohort, never from the client. A partial upsert:
// only the touched column is written, so the other steps keep their value
// (and default to false when the row is first created).
//
// Returns a result object rather than throwing: a thrown Error's message is
// stripped to a generic one in production builds when it crosses the Server
// Action boundary (the same reason app/student/kaynak-kutuphanesi/actions.ts
// returns results), so returning is what lets the toast show the real,
// user-safe reason. dbError() already logs + reports database failures.
export async function setTopicPipelineStep(input: PipelineStepInput): Promise<PipelineActionResult> {
  try {
    await assertNotImpersonating();
    const inputV = parseInput(pipelineStepSchema, input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Oturum bulunamadı." };

    const { data: profile } = await supabase.from("profiles").select("exam_type").eq("id", user.id).maybeSingle();
    const examType = profile?.exam_type === "LGS" ? "LGS" : "YKS";
    validatePipelineStep(examType, inputV, await fetchMaarifGrade(supabase, user.id));

    const { error } = await supabase.from(PIPELINE_CONFIG[examType].table).upsert(
      {
        student_id: user.id,
        course_id: inputV.courseId,
        topic_id: inputV.topicId,
        [inputV.step]: inputV.value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,course_id,topic_id" },
    );
    if (error) throw dbError(error);

    revalidatePath("/student/kaynak-takibi");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR };
  }
}
