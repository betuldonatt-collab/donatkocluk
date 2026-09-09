"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { dbError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";

// Deliberately excludes coaching_start_date/assigned_meeting_day -- those
// are read-only "system info" for the student, enforced server-side by
// the profiles_prevent_system_field_tampering trigger even if this type
// were bypassed, but keeping them out of the patch type means the form
// can never even attempt to send them.
export type ProfilePatch = Partial<{
  full_name: string | null;
  city: string | null;
  phone: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  target_university: string | null;
  target_department: string | null;
  target_ranking: string | null;
  school_name: string | null;
  obp: number | null;
  attends_dershane: boolean;
  attends_deneme_kulubu: boolean;
  has_private_tutor: boolean;
  had_previous_coaching: boolean;
  previous_yks_ranking: string | null;
  favorite_subjects: string | null;
  difficult_subjects: string | null;
}>;

const text = (max: number) => z.string().trim().max(max).nullable();

const profilePatchSchema = z
  .object({
    full_name: text(120),
    city: text(120),
    phone: text(30),
    parent_name: text(120),
    parent_phone: text(30),
    target_university: text(200),
    target_department: text(200),
    target_ranking: text(60),
    school_name: text(200),
    obp: z.number().min(0).max(500).nullable(),
    attends_dershane: z.boolean(),
    attends_deneme_kulubu: z.boolean(),
    has_private_tutor: z.boolean(),
    had_previous_coaching: z.boolean(),
    previous_yks_ranking: text(60),
    favorite_subjects: text(500),
    difficult_subjects: text(500),
  })
  .partial();

export async function updateProfile(patch: ProfilePatch) {
  await assertNotImpersonating();
  const patchV = parseInput(profilePatchSchema, patch);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { data, error } = await supabase
    .from("profiles")
    .update(patchV)
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) throw dbError(error);

  revalidatePath("/student/profile");
  return data;
}
