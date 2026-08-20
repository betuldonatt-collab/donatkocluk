"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Admin-only in practice: RLS on coach_students only allows writes when
// public.is_admin() is true, so a non-admin caller gets blocked at the
// database regardless of what this action attempts.
export async function assignCoach(studentId: string, coachId: string | null) {
  const supabase = await createClient();

  if (coachId === null) {
    const { error } = await supabase.from("coach_students").delete().eq("student_id", studentId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("coach_students")
      .upsert({ student_id: studentId, coach_id: coachId }, { onConflict: "student_id" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin");
}
