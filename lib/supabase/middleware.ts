import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROLE_HOME: Record<string, string> = {
  student: "/student",
  parent: "/parent",
  coach: "/coach",
  admin: "/admin",
};

const PROTECTED_ROLES = Object.keys(ROLE_HOME);

// @supabase/ssr's default cookie name is `sb-<project-ref>-auth-token`,
// chunked into `.0`/`.1`/... for a large JWT. This does NOT match the
// transient `-code-verifier` cookie used mid-OAuth -- that's a different
// signal (an in-progress login, not an existing session) and shouldn't
// count as "had a session".
const AUTH_COOKIE_PATTERN = /^sb-.*-auth-token(\.\d+)?$/;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            supabaseResponse.cookies.set(name, value, options),
          );
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
      return NextResponse.redirect(new URL("/", request.url));
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
      return NextResponse.redirect(new URL(home, request.url));
    }
  }

  return supabaseResponse;
}
