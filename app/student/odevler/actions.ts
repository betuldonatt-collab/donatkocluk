"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type TaskScope = "daily" | "weekly";
export type TaskStatus = "pending" | "done" | "not_done";

export async function setTaskStatus(input: {
  scope: TaskScope;
  taskId: string;
  status: TaskStatus;
  reason?: string;
  note?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("task_completions").upsert(
    {
      student_id: user.id,
      scope: input.scope,
      task_id: input.taskId,
      status: input.status,
      reason: input.reason ?? null,
      note: input.note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,scope,task_id" },
  );

  if (error) throw new Error(error.message);

  revalidatePath("/student/odevler");
}
