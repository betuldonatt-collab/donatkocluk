"use server";

import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTurkishPhone } from "@/lib/phone";
import { nonEmptyText, parseInput } from "@/lib/validation";
import {
  checkIpThrottle,
  checkLockout,
  clearFailedAttempts,
  getClientIp,
  IP_THROTTLE_MESSAGE,
  LOCKOUT_MESSAGE,
  recordFailedAttempt,
  recordFailedIp,
} from "@/lib/login-lockout";
import { checkAndRecordPublicFormAttempt, PUBLIC_FORM_THROTTLE_MESSAGE } from "@/lib/public-form-throttle";

const ROLE_HOME: Record<string, string> = {
  student: "/student",
  parent: "/parent",
  coach: "/coach",
  admin: "/admin",
};

const REQUESTABLE_ROLES = new Set(["student", "parent", "coach"]);

export type AuthFormState = {
  error?: string;
  message?: string;
};

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const phoneRaw = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");
  const formRole = String(formData.get("role") ?? "").trim();

  const phone = normalizeTurkishPhone(phoneRaw);
  if (!phone) {
    return { error: "Geçerli bir telefon numarası gir (05XX XXX XX XX)." };
  }

  const adminClient = createAdminClient();
  const ip = await getClientIp();

  if (await checkIpThrottle(adminClient, ip)) {
    return { error: IP_THROTTLE_MESSAGE };
  }

  if (await checkLockout(adminClient, phone)) {
    await recordFailedIp(adminClient, ip);
    return { error: LOCKOUT_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ phone, password });

  if (error) {
    console.error("[signIn] signInWithPassword failed:", { message: error.message, status: error.status, code: error.code });
    Sentry.captureException(error);
    await recordFailedIp(adminClient, ip);
    const justLocked = await recordFailedAttempt(adminClient, phone);
    return { error: justLocked ? LOCKOUT_MESSAGE : "Telefon numarası veya şifre hatalı." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user!.id).maybeSingle();
  
  if (profile?.is_active === false) {
    await supabase.auth.signOut();
    return { error: "Bu hesap pasif durumda. Yönetici ile iletişime geç." };
  }

  const actualRole = profile?.role;
  if (!actualRole || !(actualRole in ROLE_HOME)) {
    await supabase.auth.signOut();
    console.error("[signIn] authenticated user has no valid profile role", { userId: user!.id, role: actualRole ?? null });
    Sentry.captureMessage("signIn: authenticated user has no valid profile role", { extra: { userId: user!.id, role: actualRole ?? null } });
    return { error: "Hesap profili bulunamadı. Yönetici ile iletişime geç." };
  }

  // Strict Door Check: If the form specifies a role, it must match the database role exactly.
  if (formRole && formRole !== actualRole) {
    await supabase.auth.signOut();
    return { error: "Bu giriş kapısından bu hesap türüyle giriş yapamazsınız. Lütfen doğru giriş sayfasını kullanın." };
  }

  await clearFailedAttempts(adminClient, phone);
  redirect(ROLE_HOME[actualRole]);
}

export async function submitSignupRequest(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (await checkAndRecordPublicFormAttempt("signup_request")) {
    return { error: PUBLIC_FORM_THROTTLE_MESSAGE };
  }

  const fullNameRaw = String(formData.get("fullName") ?? "");
  const phoneRaw = String(formData.get("phone") ?? "");
  const role = String(formData.get("role") ?? "student");

  let fullName: string;
  try {
    fullName = parseInput(nonEmptyText(120, "Ad soyad"), fullNameRaw);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ad soyad zorunludur." };
  }
  if (!REQUESTABLE_ROLES.has(role)) {
    return { error: "Geçersiz rol." };
  }
  const phone = normalizeTurkishPhone(phoneRaw);
  if (!phone) {
    return { error: "Geçerli bir telefon numarası gir (05XX XXX XX XX)." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("signup_requests")
    .insert({ full_name: fullName, phone, requested_role: role });

  if (error) {
    console.error("[submitSignupRequest]", error);
    return { error: "Kayıt isteği gönderilemedi. Lütfen tekrar dene." };
  }

  return {
    message: "Kayıt isteğin alındı. Yönetici onayladıktan sonra sana telefonla ulaşılacak.",
  };
}

export async function submitPasswordResetRequest(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (await checkAndRecordPublicFormAttempt("password_reset_request")) {
    return { error: PUBLIC_FORM_THROTTLE_MESSAGE };
  }

  const phoneRaw = String(formData.get("phone") ?? "");
  const phone = normalizeTurkishPhone(phoneRaw);
  if (!phone) {
    return { error: "Geçerli bir telefon numarası gir (05XX XXX XX XX)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("password_reset_requests").insert({ phone });
  if (error) {
    console.error("[submitPasswordResetRequest]", error);
    return { error: "İstek gönderilemedi. Lütfen tekrar dene." };
  }

  return { message: "İsteğin yöneticiye iletildi. Şifren sıfırlandığında telefonla ulaşılacak." };
}