"use server";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { parseInput, uuidSchema } from "@/lib/validation";
import { clearImpersonationCookie, setImpersonationCookie, type ImpersonationState } from "./impersonation";

export async function startImpersonation(state: ImpersonationState) {
  await setImpersonationCookie(state);
  redirect("/coach");
}

export async function stopImpersonation() {
  await clearImpersonationCookie();
  redirect("/admin");
}

// Moved here from app/admin/actions.ts -- its only caller is the coach
// profile page's impersonation-email-display case (while impersonating,
// the session's own auth.getUser() returns the real admin, not the
// target coach, so the target's email needs this admin-privileged
// lookup instead). Not a general admin action, so this is the more
// honest home for it than the cross-panel `@/app/admin/actions` import
// it used to require.
export async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") throw new Error("Bu işlem için yetkiniz yok.");

  const userIdV = parseInput(uuidSchema, userId);
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.getUserById(userIdV);
  if (error) throw dbError(error);
  return data.user?.email ?? null;
}
