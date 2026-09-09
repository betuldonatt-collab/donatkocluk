import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/login-lockout";

// Generic per-IP throttle for anonymous public form submissions --
// signup_requests and password_reset_requests (app/login/actions.ts) --
// distinct from login-lockout.ts's throttle, which only counts FAILED
// login attempts. There's no success/failure distinction for these forms:
// every submission is itself the thing being rate-limited, since each one
// writes a row an admin has to review.
export const PUBLIC_FORM_MAX_ATTEMPTS = 5;
export const PUBLIC_FORM_WINDOW_SECONDS = 15 * 60;
export const PUBLIC_FORM_THROTTLE_MESSAGE =
  "Bu cihazdan çok fazla istek gönderildi. Lütfen birkaç dakika sonra tekrar dene.";

export { getClientIp };

// Records this submission against the IP+bucket's rolling window and
// returns whether it just crossed the limit. Fails open (matching
// login-lockout.ts's own error-handling convention) if the RPC call
// itself errors, and no-ops for "unknown" IPs (local dev has no
// x-forwarded-for proxy) rather than throttling all local traffic together.
export async function checkAndRecordPublicFormAttempt(bucket: string): Promise<boolean> {
  const ip = await getClientIp();
  if (ip === "unknown") return false;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc("record_public_form_attempt", {
    p_ip: ip,
    p_bucket: bucket,
    p_window_seconds: PUBLIC_FORM_WINDOW_SECONDS,
  });
  if (error) {
    console.error("[public form throttle] failed to record attempt:", error);
    return false;
  }

  return (data ?? 0) > PUBLIC_FORM_MAX_ATTEMPTS;
}
