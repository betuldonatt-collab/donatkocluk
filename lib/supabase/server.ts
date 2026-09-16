import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { applyRememberMeCookieOptions, REMEMBER_ME_COOKIE_NAME, rememberMeCookieOptions } from "@/lib/remember-me";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            const rememberMe = cookieStore.get(REMEMBER_ME_COOKIE_NAME)?.value === "1";
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, applyRememberMeCookieOptions(name, options, rememberMe)),
            );
            // Sliding window: Supabase only calls setAll when it actually
            // rewrote its own session cookies (a real token refresh just
            // happened) -- re-extending the marker's own expiry in that
            // same moment means it always outlives the session cookie it
            // describes, instead of marching toward its own fixed expiry
            // while the user keeps actively getting refreshed right past it.
            if (rememberMe) {
              cookieStore.set(REMEMBER_ME_COOKIE_NAME, "1", rememberMeCookieOptions());
            }
          } catch {
            // Called from a Server Component; safe to ignore because
            // middleware refreshes the session on every request.
          }
        },
      },
    },
  );
}
