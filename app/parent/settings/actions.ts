"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { changePasswordWithVerification } from "@/lib/change-password";
import { dbError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";

export async function changePassword(oldPassword: string, newPassword: string) {
  await changePasswordWithVerification(oldPassword, newPassword);
}

const phoneSchema = z.string().trim().max(30).nullable();

export async function updateParentPhone(phone: string) {
  const phoneV = parseInput(phoneSchema, phone.trim() || null);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("profiles").update({ phone: phoneV }).eq("id", user.id);
  if (error) throw dbError(error);

  revalidatePath("/parent/settings");
}
