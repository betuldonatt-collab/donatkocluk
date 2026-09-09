"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { dbError } from "@/lib/errors";
import { nonEmptyText, parseInput } from "@/lib/validation";

export type CoachSpecialization = "yks_sayisal" | "yks_ea" | "yks_sozel" | "yks_ydt" | "lgs_ortaokul";

const updateCoachProfileSchema = z.object({
  fullName: nonEmptyText(120, "Ad soyad"),
  avatarUrl: z.string().trim().max(2000).nullable(),
  bio: z.string().trim().max(2000).nullable(),
  specialization: z.enum(["yks_sayisal", "yks_ea", "yks_sozel", "yks_ydt", "lgs_ortaokul"]).nullable(),
  phone: z.string().trim().max(30).nullable(),
  emergencyContactName: z.string().trim().max(120).nullable(),
  emergencyContactPhone: z.string().trim().max(30).nullable(),
  emergencyContactRelationship: z.string().trim().max(60).nullable(),
  university: z.string().trim().max(200).nullable(),
  city: z.string().trim().max(120).nullable(),
});

export async function updateCoachProfile(input: {
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  specialization: CoachSpecialization | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  university: string | null;
  city: string | null;
}) {
  await assertNotImpersonating();
  const inputV = parseInput(updateCoachProfileSchema, input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: inputV.fullName, avatar_url: inputV.avatarUrl })
    .eq("id", user.id);
  if (profileError) throw dbError(profileError);

  const { error: coachProfileError } = await supabase.from("coach_profiles").upsert(
    {
      coach_id: user.id,
      bio: inputV.bio,
      specialization: inputV.specialization,
      phone: inputV.phone,
      emergency_contact_name: inputV.emergencyContactName,
      emergency_contact_phone: inputV.emergencyContactPhone,
      emergency_contact_relationship: inputV.emergencyContactRelationship,
      university: inputV.university,
      city: inputV.city,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "coach_id" },
  );
  if (coachProfileError) throw dbError(coachProfileError);

  revalidatePath("/coach/profile");
}
