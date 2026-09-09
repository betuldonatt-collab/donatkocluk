"use server";

import { redirect } from "next/navigation";

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

// Roles a stranger is allowed to REQUEST an account for. 'admin' is
// deliberately absent -- there is no code path, anywhere, where public
// input can result in an admin account. Admins are created only by an
// existing admin, through a separate, explicit action.
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
  const role = String(formData.get("role") ?? "student");

  const phone = normalizeTurkishPhone(phoneRaw);
  if (!phone) {
    return { error: "Geçerli bir telefon numarası gir (05XX XXX XX XX)." };
  }

  const adminClient = createAdminClient();
  const ip = await getClientIp();

  // IP throttle first -- an attacker hammering a single already-locked
  // phone, or spraying guesses across many phones, still counts against
  // their IP's budget even before the per-phone check runs.
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
    await recordFailedIp(adminClient, ip);
    const justLocked = await recordFailedAttempt(adminClient, phone);
    return { error: justLocked ? LOCKOUT_MESSAGE : "Telefon numarası veya şifre hatalı." };
  }

  // Checked here too (not just requireViewContext) so a deactivated user
  // gets an immediate, clear rejection instead of a successful-looking
  // login that then bounces them straight back out.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", user!.id).maybeSingle();
  if (profile?.is_active === false) {
    await supabase.auth.signOut();
    return { error: "Bu hesap pasif durumda. Yönetici ile iletişime geç." };
  }

  // A real successful login (right phone AND right password) is the one
  // signal that resets the counter -- a locked account still can't get
  // here at all (rejected above before signInWithPassword ever runs).
  await clearFailedAttempts(adminClient, phone);

  redirect(ROLE_HOME[role] ?? "/");
}

// Replaces the old direct signUp() call. This is the fix for the
// front-door admin vulnerability: public submission never touches
// auth.users/profiles at all -- it only inserts a row into
// signup_requests (role constrained to student/parent/coach at the
// column-type level, see 0030). No account exists, and none can be
// escalated, until an admin explicitly approves it
// (approveSignupRequest, app/admin/actions.ts).
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

// No email exists to send a reset link to (phone-only accounts, see
// approveSignupRequest) -- this just queues the phone number for an
// admin to see and manually reset via "Şifreyi Sıfırla" on that user's
// detail page. Anonymous by design (the caller is, by definition, locked
// out and unauthenticated); RLS (password_reset_requests_anon_insert,
// 0035/0036) is the only thing gating this, same pattern as signup_requests.
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
