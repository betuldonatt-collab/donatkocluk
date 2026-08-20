"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function addResource(courseId: string, name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { data, error } = await supabase
    .from("student_resources")
    .insert({ student_id: user.id, course_id: courseId, name })
    .select("id, name, course_id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/student/kaynak-kutuphanesi");
  revalidatePath("/student/kaynak-takibi");
  return data as { id: string; name: string; course_id: string };
}

// Bulk add: one row per non-empty line, all against the same course — the
// "add all your books at once" flow. Kaynak Takibi reads the same
// student_resources table, so it picks these up automatically.
export async function addResources(courseId: string, names: string[]) {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { data, error } = await supabase
    .from("student_resources")
    .insert(cleaned.map((name) => ({ student_id: user.id, course_id: courseId, name })))
    .select("id, name, course_id");

  if (error) throw new Error(error.message);

  revalidatePath("/student/kaynak-kutuphanesi");
  revalidatePath("/student/kaynak-takibi");
  return data as { id: string; name: string; course_id: string }[];
}
