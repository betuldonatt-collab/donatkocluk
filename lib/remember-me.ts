import type { CookieOptions } from "@supabase/ssr";

// "Beni Hatırla" (app/login/login-form.tsx, app/login/actions.ts) -- a
// small first-party marker cookie, set at sign-in and re-extended on
// every subsequent auth-cookie rewrite (see applyRememberMeCookieOptions
// below, called from both lib/supabase/server.ts and
// lib/supabase/middleware.ts). This is what makes it a SLIDING window --
// an active user's session keeps pushing 30 days further out every time
// they're refreshed, rather than expiring on a fixed clock from the
// moment they logged in. Only 30 CONSECUTIVE days with no visit at all
// (no refresh ever fires, so nothing ever re-extends either cookie) lets
// both this marker and the Supabase session cookie it describes actually
// expire.
export const REMEMBER_ME_COOKIE_NAME = "remember_me";
export const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Computed fresh on every call, not a fixed constant -- always means "30
// days from right now," paired alongside maxAge below as a defense-in-depth
// hedge for iOS/Safari (WebKit) cookie-persistence quirks. Max-Age is fully
// supported by modern Safari, but Expires is the older, more universally
// respected attribute; setting both costs nothing and only helps if a given
// browser/webview ever mishandles one of the two.
function rememberMeExpiresAt(): Date {
  return new Date(Date.now() + REMEMBER_ME_MAX_AGE_SECONDS * 1000);
}

// Same httpOnly/sameSite shape as the existing impersonation cookie
// (lib/impersonation.ts) -- server-only, never read from client JS.
// `secure` is gated on NODE_ENV (not just always-on) so it still works over
// plain http in local dev -- a Secure cookie is silently dropped by every
// browser on a non-HTTPS origin.
export function rememberMeCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: REMEMBER_ME_MAX_AGE_SECONDS,
    expires: rememberMeExpiresAt(),
  };
}

// @supabase/ssr's default cookie name is `sb-<project-ref>-auth-token`,
// chunked into `.0`/`.1`/... for a large JWT -- mirrors AUTH_COOKIE_PATTERN
// in lib/supabase/middleware.ts (kept as a separate copy there, since that
// one matches against the *request's* cookies for an unrelated purpose --
// see the comment at its own definition).
const AUTH_COOKIE_PATTERN = /^sb-.*-auth-token(\.\d+)?$/;

// Adjusts ONE cookie's options right before it's written -- called once
// per cookie in cookiesToSet, from both setAll implementations. Every
// non-auth cookie (the OAuth code-verifier, the impersonation cookie,
// this very remember_me marker) passes through completely untouched;
// only Supabase's own session cookies are ever affected.
export function applyRememberMeCookieOptions(
  cookieName: string,
  options: CookieOptions,
  rememberMe: boolean,
): CookieOptions {
  if (!AUTH_COOKIE_PATTERN.test(cookieName)) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rememberMe ? { ...rest, maxAge: REMEMBER_ME_MAX_AGE_SECONDS, expires: rememberMeExpiresAt() } : rest;
}
