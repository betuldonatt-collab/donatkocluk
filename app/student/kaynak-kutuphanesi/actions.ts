"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { dbError } from "@/lib/errors";
import { nonEmptyText, parseInput } from "@/lib/validation";

// course_id is a curriculum slug (e.g. "tyt-matematik", "paragraf"), not a
// database-generated id -- student_resources.course_id is a plain `text`
// column with no uuid constraint. Validating it against uuidSchema would
// reject every real course id unconditionally, since none of them are
// actually UUIDs.
const courseIdSchema = nonEmptyText(100, "Ders");

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
    .select("id, name, course_id")
    .single();

  if (error) throw dbError(error);

  revalidatePath("/student/kaynak-kutuphanesi");
  revalidatePath("/student/kaynak-takibi");
  return data as { id: string; name: string; course_id: string };
}

const namesSchema = z.array(z.string().trim().min(1).max(200)).max(500);

// Bulk add: one row per non-empty line, all against the same course — the
// "add all your books at once" flow. Kaynak Takibi reads the same
// student_resources table, so it picks these up automatically.
export async function addResources(courseId: string, names: string[]) {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];
  await assertNotImpersonating();
  const courseIdV = parseInput(courseIdSchema, courseId);
  const namesV = parseInput(namesSchema, cleaned);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { data, error } = await supabase
    .from("student_resources")
    .insert(namesV.map((name) => ({ student_id: user.id, course_id: courseIdV, name })))
    .select("id, name, course_id");

  if (error) throw dbError(error);

  revalidatePath("/student/kaynak-kutuphanesi");
  revalidatePath("/student/kaynak-takibi");
  return data as { id: string; name: string; course_id: string }[];
}
