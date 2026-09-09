"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { changePasswordWithVerification } from "@/lib/change-password";
import { dbError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";

export async function changePassword(oldPassword: string, newPassword: string) {
  await assertNotImpersonating();
  await changePasswordWithVerification(oldPassword, newPassword);
}

const coachSettingsSchema = z.object({
  inactivityThresholdDays: z.number().int().min(1).max(60),
  criticalCompletionThresholdPct: z.number().int().min(0).max(100),
  successAlertEnabled: z.boolean(),
});

export async function updateCoachSettings(input: {
  inactivityThresholdDays: number;
  criticalCompletionThresholdPct: number;
  successAlertEnabled: boolean;
}) {
  await assertNotImpersonating();
  const inputV = parseInput(coachSettingsSchema, input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("coach_settings").upsert(
    {
      coach_id: user.id,
      inactivity_threshold_days: inputV.inactivityThresholdDays,
      critical_completion_threshold_pct: inputV.criticalCompletionThresholdPct,
      success_alert_enabled: inputV.successAlertEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "coach_id" },
  );
  if (error) throw dbError(error);

  revalidatePath("/coach/settings");
}
