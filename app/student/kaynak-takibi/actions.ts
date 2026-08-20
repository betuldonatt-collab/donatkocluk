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
    .select("id, name")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/student/kaynak-takibi");
  return data as { id: string; name: string };
}

export async function toggleResourceProgress(input: {
  courseId: string;
  topicId: string;
  resourceId: string;
  solved: boolean;
  reviewed: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("student_resource_progress").upsert(
    {
      student_id: user.id,
      course_id: input.courseId,
      topic_id: input.topicId,
      resource_id: input.resourceId,
      solved: input.solved,
      reviewed: input.reviewed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,topic_id,resource_id" },
  );

  if (error) throw new Error(error.message);

  revalidatePath("/student/kaynak-takibi");
}
