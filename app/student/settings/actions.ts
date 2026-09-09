"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { changePasswordWithVerification } from "@/lib/change-password";
import { dbError } from "@/lib/errors";
import { nonEmptyText, parseInput } from "@/lib/validation";

// Group 2 (Password Policy Enforcement): the minimum-6-character rule is
// enforced inside changePasswordWithVerification's own Zod schema, shared
// by every panel's password change form -- see lib/change-password.ts.
export async function changePassword(oldPassword: string, newPassword: string) {
  await assertNotImpersonating();
  await changePasswordWithVerification(oldPassword, newPassword);
}

export async function submitCancellationRequest(reason: string) {
  await assertNotImpersonating();
  const reasonV = parseInput(nonEmptyText(1000, "Sebep"), reason);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase
    .from("account_cancellation_requests")
    .insert({ student_id: user.id, reason: reasonV });

  if (error) throw dbError(error);

  revalidatePath("/student/settings");
}
