"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function togglePastQuestion(input: {
  courseId: string;
  topicId: string;
  year: number;
  solved: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("past_question_progress").upsert(
    {
      student_id: user.id,
      course_id: input.courseId,
      topic_id: input.topicId,
      year: input.year,
      solved: input.solved,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,topic_id,year" },
  );

  if (error) throw new Error(error.message);

  revalidatePath("/student/cikmis-sorular");
}
