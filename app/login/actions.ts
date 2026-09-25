"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { clearImpersonationCookie } from "@/lib/impersonation";
import { REMEMBER_ME_COOKIE_NAME, rememberMeCookieOptions } from "@/lib/remember-me";
import { dbError } from "@/lib/errors";
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
const EXAM_TYPES = new Set(["YKS", "LGS"]);

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

  // Neither check depends on the other's result, only their booleans --
  // running them concurrently instead of two sequential round trips halves
  // this part of the login's latency on the common (not-throttled,
  // not-locked-out) path. Priority order is preserved exactly: a throttled
  // IP still short-circuits before the lockout branch even looks at its
  // own result, matching the original sequential behavior.
  const [isThrottled, isLockedOut] = await Promise.all([checkIpThrottle(adminClient, ip), checkLockout(adminClient, phone)]);

  if (isThrottled) {
    return { error: IP_THROTTLE_MESSAGE };
  }

  if (isLockedOut) {
    await recordFailedIp(adminClient, ip);
    return { error: LOCKOUT_MESSAGE };
  }

  // "Beni Hatırla" -- set (or clear, if this login on this browser is now
  // unchecked after a previous one had it checked) BEFORE createClient()
  // below so its own setAll (lib/supabase/server.ts) sees the marker
  // already in this same request's cookie store the moment
  // signInWithPassword triggers it to write the session cookies.
  const rememberMe = formData.get("rememberMe") === "on";
  const cookieStore = await cookies();
  if (rememberMe) {
    cookieStore.set(REMEMBER_ME_COOKIE_NAME, "1", rememberMeCookieOptions());
  } else {
    cookieStore.delete(REMEMBER_ME_COOKIE_NAME);
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ phone, password });

  if (error) {
    console.error("[signIn] signInWithPassword failed:", { message: error.message, status: error.status, code: error.code });
    Sentry.captureException(error);
    await recordFailedIp(adminClient, ip);
    const justLocked = await recordFailedAttempt(adminClient, phone);
    return { error: justLocked ? LOCKOUT_MESSAGE : "Telefon numarası veya şifre hatalı." };
  }

  // A stale impersonation cookie from an earlier admin "view as coach"
  // session (set by setImpersonationCookie, app/admin/actions.ts) that
  // was never cleared -- e.g. the admin navigated away instead of
  // clicking "Görünümden Çık" -- would otherwise silently survive into
  // WHOEVER logs into this browser next, for up to its 4-hour maxAge.
  // getViewContext only ever honors that cookie for an actual admin
  // session, but assertNotImpersonating (called at the top of most write
  // actions) only checks whether the cookie is present at all, with no
  // regard for who's making the request -- so a real coach signing in
  // fresh on that same browser would pass getViewContext's check but
  // still get every write rejected by the leftover cookie. Clearing it
  // on every successful sign-in, before anything else, means a new
  // session never inherits state from whatever came before it on this
  // browser. Pure cookie op, no network round trip.
  await clearImpersonationCookie();

  // signInWithPassword's own response already carries the authenticated
  // user -- a separate supabase.auth.getUser() call right after it would
  // just re-fetch the exact same thing over another network round trip.
  const user = signInData.user;
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

// Logout: global-scope signOut revokes every refresh token for this user
// (all devices/sessions, not just this browser) and clears the auth
// cookies; the remember-me marker and any stale impersonation cookie are
// removed too, so nothing carries over to whoever signs in next.
export async function signOut(role?: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) {
    console.error("[signOut] failed:", { message: error.message });
    // Still fall back to clearing this browser's own session.
    await supabase.auth.signOut({ scope: "local" });
  }
  const cookieStore = await cookies();
  cookieStore.delete(REMEMBER_ME_COOKIE_NAME);
  await clearImpersonationCookie();
  const safeRole = role && role in ROLE_HOME ? role : "";
  redirect(safeRole ? `/login?role=${safeRole}` : "/login");
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
  const examTypeRaw = String(formData.get("examType") ?? "");

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
  // Only a student request carries a cohort -- parent/coach requests leave
  // this null regardless of what the form sent.
  const isMaarif9 = role === "student" && examTypeRaw === "MAARIF9";
  const isMaarif10 = role === "student" && examTypeRaw === "MAARIF10";
  // "9./10. Sınıf (Maarif)" are not exam_types: those students stay on the YKS
  // default and are marked by profiles.is_maarif9 / is_maarif10 (carried as
  // signup_requests.is_maarif9 / is_maarif10). The two are mutually exclusive.
  const examType = role === "student" ? (isMaarif9 || isMaarif10 ? "YKS" : EXAM_TYPES.has(examTypeRaw) ? examTypeRaw : null) : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("signup_requests")
    // The Maarif flags are only sent when true, so every other signup keeps
    // working exactly as before even if migrations 0097/0099 are not applied yet.
    .insert({
      full_name: fullName,
      phone,
      requested_role: role,
      exam_type: examType,
      ...(isMaarif9 ? { is_maarif9: true } : {}),
      ...(isMaarif10 ? { is_maarif10: true } : {}),
    });

  if (error) {
    // dbError logs the full raw Postgres error (message/code/details/hint)
    // AND reports it to Sentry -- same sanitize-and-log convention every
    // other DB-touching action uses. This is a public, unauthenticated
    // form (anon role, no login required), so the raw error never reaches
    // the client either way; check Sentry/Vercel logs for the real cause.
    dbError(error);
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
    dbError(error);
    return { error: "İstek gönderilemedi. Lütfen tekrar dene." };
  }

  return { message: "İsteğin yöneticiye iletildi. Şifren sıfırlandığında telefonla ulaşılacak." };
}