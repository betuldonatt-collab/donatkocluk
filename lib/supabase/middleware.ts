import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROLE_HOME: Record<string, string> = {
  student: "/student",
  parent: "/parent",
  coach: "/coach",
  admin: "/admin",
};

const PROTECTED_ROLES = Object.keys(ROLE_HOME);

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const routeRole = PROTECTED_ROLES.find(
    (role) => path === `/${role}` || path.startsWith(`/${role}/`),
  );

  if (routeRole) {
    if (!user) {
      // TEMPORARY diagnostic (remove once the /admin redirect issue is
      // confirmed fixed) -- distinguishes "middleware never saw a session
      // at all" from the profile-role branch below, which looks identical
      // to the end user (both land on "/").
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
      // TEMPORARY diagnostic, same reason as above.
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
