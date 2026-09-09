import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// --- Security Hardening Group 1: brute-force guard (P0 hardening) ---------
//
// Shared by app/login/actions.ts AND lib/change-password.ts -- both are
// "verify this phone+password" checks, and change-password's old-password
// re-verification used to call signInWithPassword directly, completely
// bypassing this guard (an authenticated session could brute-force the
// real password with zero risk of ever locking). Routing both through
// the exact same phone-keyed lock closes that by construction rather
// than by two independently-maintained copies.
//
// The counter itself lives in Postgres (record_login_failure, migration
// 0048) as a single atomic statement -- a JS-side read-then-upsert let
// concurrent guesses race past the threshold. login_failed_attempts has
// zero RLS grants to anon/authenticated (0041/0042), so every call here
// goes through the service-role client.
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_TTL_MS = 30 * 60 * 1000;
export const LOCKOUT_MESSAGE =
  "Çok fazla hatalı deneme nedeniyle hesabın geçici olarak kilitlendi. Yönetici seninle iletişime geçecek.";

// A lock older than the TTL is treated as expired rather than requiring
// an admin to clear it -- turns the old "indefinite DoS against a known
// phone number" into a self-healing, merely-annoying one.
export async function checkLockout(adminClient: AdminClient, phone: string): Promise<boolean> {
  const { data } = await adminClient.from("login_failed_attempts").select("locked_at").eq("phone", phone).maybeSingle();
  if (!data?.locked_at) return false;
  return Date.now() - new Date(data.locked_at).getTime() < LOCKOUT_TTL_MS;
}

// Returns whether THIS call is the one that just crossed the threshold
// (see record_login_failure's just_locked, 0048) -- callers use that to
// decide whether to show the lockout message and queue an admin
// notification, vs. an ordinary "wrong password" message.
type RecordLoginFailureRow = { fail_count: number; locked_at: string | null; just_locked: boolean };

export async function recordFailedAttempt(adminClient: AdminClient, phone: string): Promise<boolean> {
  const { data, error } = await adminClient
    .rpc("record_login_failure", { p_phone: phone, p_max_attempts: MAX_FAILED_ATTEMPTS })
    .single<RecordLoginFailureRow>();
  if (error) {
    console.error("[login lockout] failed to record attempt:", error);
    return false;
  }

  if (data.just_locked) {
    // Same queue the "Şifremi Unuttum" flow feeds (password_reset_requests,
    // 0035) -- reason (0041) flags this row as a security lockout rather
    // than an ordinary self-service request, so the admin UI can word it
    // differently and an admin knows to actually call the person, not
    // just reset a password they may not have lost.
    const { error: queueError } = await adminClient.from("password_reset_requests").insert({
      phone,
      reason: "KİLİTLENDİ: 5 Hatalı Giriş. Kullanıcıyı arayın.",
    });
    if (queueError) console.error("[login lockout] failed to queue admin notification:", queueError);
  }

  return data.just_locked;
}

export async function clearFailedAttempts(adminClient: AdminClient, phone: string) {
  const { error } = await adminClient.from("login_failed_attempts").delete().eq("phone", phone);
  if (error) console.error("[login lockout] failed to clear attempts:", error);
}

// --- IP throttle (P0 hardening, second half) -------------------------------
//
// Independent of the phone lock above: caps how many failed logins ANY
// single IP can generate across ALL phone numbers within a rolling
// window, so one attacker can't mass-target many victims' accounts while
// staying under any single phone's own threshold. This is a rolling
// throttle, not an admin-clearable lock -- it decays on its own once the
// window passes (see record_login_failure_ip, 0048).
export const IP_MAX_ATTEMPTS = 20;
export const IP_WINDOW_SECONDS = 15 * 60;
export const IP_THROTTLE_MESSAGE =
  "Bu cihazdan çok fazla hatalı deneme yapıldı. Lütfen birkaç dakika sonra tekrar dene.";

// x-forwarded-for is only trustworthy behind a proxy that sets it itself
// (Vercel does); local dev has no such proxy, so "unknown" is expected
// there and every check/record call below treats it as a no-op rather
// than throttling all local traffic together under one bogus shared key.
export async function getClientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  if (!forwarded) return "unknown";
  return forwarded.split(",")[0].trim() || "unknown";
}

export async function checkIpThrottle(adminClient: AdminClient, ip: string): Promise<boolean> {
  if (ip === "unknown") return false;
  const { data } = await adminClient
    .from("login_ip_attempts")
    .select("fail_count, window_started_at")
    .eq("ip", ip)
    .maybeSingle();
  if (!data) return false;
  const windowAgeMs = Date.now() - new Date(data.window_started_at).getTime();
  if (windowAgeMs > IP_WINDOW_SECONDS * 1000) return false;
  return data.fail_count >= IP_MAX_ATTEMPTS;
}

export async function recordFailedIp(adminClient: AdminClient, ip: string) {
  if (ip === "unknown") return;
  const { error } = await adminClient.rpc("record_login_failure_ip", { p_ip: ip, p_window_seconds: IP_WINDOW_SECONDS });
  if (error) console.error("[login lockout] failed to record IP attempt:", error);
}
