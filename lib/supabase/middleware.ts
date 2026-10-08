import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { perfFetch } from "@/lib/perf-log";
import { applyRememberMeCookieOptions, isRememberMe, REMEMBER_ME_COOKIE_NAME, rememberMeCookieOptions } from "@/lib/remember-me";

const ROLE_HOME: Record<string, string> = {
  student: "/student",
  parent: "/parent",
  coach: "/coach",
  admin: "/admin",
};

const PROTECTED_ROLES = Object.keys(ROLE_HOME);

// The pages a person lands on when they open the site or the home-screen app (the PWA's start_url is "/"): the panel chooser,
// the sign-in page, the team chooser. A person who is ALREADY signed in has no business on any of them -- they are sent straight to
// their panel. Without this, closing the tab / the app and opening it again showed the chooser, which looks exactly like being
// logged out even though the session cookie was fine (the real cause of the "I am logged out whenever I close the app" reports).
const ENTRY_PATHS = new Set(["/", "/login", "/team"]);

// A redirect response of the proxy must carry the cookies the session refresh above just wrote: getUser() may have rotated the
// refresh token, and a redirect built from scratch would drop the new tokens -- the browser would keep the already-used old
// refresh token, and the next request would fail (reuse detection) and log the person out.
function redirectKeepingCookies(request: NextRequest, supabaseResponse: NextResponse, pathname: string) {
  const response = NextResponse.redirect(new URL(pathname, request.url));
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

// @supabase/ssr's default cookie name is `sb-<project-ref>-auth-token`,
// chunked into `.0`/`.1`/... for a large JWT. This does NOT match the
// transient `-code-verifier` cookie used mid-OAuth -- that's a different
// signal (an in-progress login, not an existing session) and shouldn't
// count as "had a session".
const AUTH_COOKIE_PATTERN = /^sb-.*-auth-token(\.\d+)?$/;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Snapshot before any refresh below can touch request.cookies -- same
  // reasoning as hadAuthCookie further down.
  const rememberMe = isRememberMe(request.cookies.get(REMEMBER_ME_COOKIE_NAME)?.value);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // TEMPORARY: logs slow Supabase calls as "[perf] ..." (lib/perf-log.ts).
      global: { fetch: perfFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, applyRememberMeCookieOptions(name, options, rememberMe)),
          );
          // Sliding window -- see the matching comment in
          // lib/supabase/server.ts's own setAll. This is the path that
          // matters most for "stay logged in as long as they keep using
          // it": every authenticated page load runs through here.
          if (rememberMe) {
            supabaseResponse.cookies.set(REMEMBER_ME_COOKIE_NAME, "1", rememberMeCookieOptions());
          }
        },
      },
    },
  );

  // Snapshot BEFORE calling getUser() -- a successful refresh inside that
  // call rewrites request.cookies via setAll above, so checking cookies
  // afterward would no longer reflect what the browser actually sent in.
  const hadAuthCookie = request.cookies
    .getAll()
    .some((cookie) => AUTH_COOKIE_PATTERN.test(cookie.name));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const routeRole = PROTECTED_ROLES.find(
    (role) => path === `/${role}` || path.startsWith(`/${role}/`),
  );

  if (routeRole) {
    if (!user) {
      if (hadAuthCookie) {
        // A session cookie WAS sent, but getUser() still failed -- almost
        // certainly a refresh-token rotation race: a sibling request from
        // the same drag/save burst already rotated the token, so this
        // request's refresh attempt is using an already-invalidated one.
        // This is NOT "logged out" -- redirecting here is exactly what
        // produced the sudden-logout bug during concurrent schedule saves.
        // Let this request through once; the browser's Supabase client
        // will pick up a valid session on its next call, and the very
        // next middleware pass will see a good user again.
        console.error(
          "[proxy] getUser failed but auth cookie present -- likely refresh race, allowing through",
          { path, routeRole },
        );
        return supabaseResponse;
      }

      // No auth cookie at all -- genuinely unauthenticated.
      console.error("[proxy] no user in middleware", { path, routeRole });
      return redirectKeepingCookies(request, supabaseResponse, "/");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // The one legitimate cross-role case: an admin viewing /coach through
    // an impersonation cookie (lib/impersonation.ts's getViewContext has
    // the same routeRole==="coach" && actualRole==="admin" condition --
    // kept in sync deliberately, not a general "admin bypasses everything"
    // rule, since admin-as-student/parent impersonation was removed).
    // This early check can't itself read the cookie's target validity;
    // it just lets the request through to the layout, which does.
    const isAdminCoachPreview = routeRole === "coach" && profile?.role === "admin";
    if (profile?.role !== routeRole && !isAdminCoachPreview) {
      console.error("[proxy] role mismatch or missing profile in middleware", {
        path,
        routeRole,
        userId: user.id,
        profileRole: profile?.role ?? null,
        profileError: profileError?.message ?? null,
      });
      const home = profile?.role ? ROLE_HOME[profile.role] : "/";
      return redirectKeepingCookies(request, supabaseResponse, home);
    }
  }

  // Already signed in and opening the site / sign-in page: straight to the panel. Only for plain page loads (GET): the sign-in
  // form itself is a Server Action POSTed to /login and must never be redirected. A deactivated account, or one without a valid
  // role, is left on the page (the panels sign it out / send it to /login themselves), so this can never loop.
  if (user && !routeRole && ENTRY_PATHS.has(path) && request.method === "GET") {
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
    const role = profile?.role as string | null | undefined;
    if (role && role in ROLE_HOME && profile?.is_active !== false) {
      return redirectKeepingCookies(request, supabaseResponse, ROLE_HOME[role]);
    }
  }

  return supabaseResponse;
}
