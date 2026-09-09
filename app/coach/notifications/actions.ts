"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";

export async function markNotificationDone(id: string) {
  await assertNotImpersonating();
  const idV = parseInput(uuidSchema, id);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  // Double-layer authorization (matches app/coach/actions.ts's
  // convention): scope the update to this coach's own notification at
  // the code level too, not just via notifications_coach_all RLS.
  const { error } = await supabase
    .from("notifications")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("id", idV)
    .eq("coach_id", user.id);
  if (error) throw dbError(error);

  revalidatePath("/coach/notifications");
  revalidatePath("/coach", "layout");
}
