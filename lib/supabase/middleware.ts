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
      return NextResponse.redirect(new URL("/", request.url));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    // Admins may browse every panel (to preview each role's UI from the
    // admin panel's view switcher) without being bounced to their own home.
    if (profile?.role !== routeRole && profile?.role !== "admin") {
      const home = profile?.role ? ROLE_HOME[profile.role] : "/";
      return NextResponse.redirect(new URL(home, request.url));
    }

    if (profile?.role) {
      // Forward the role downstream via a request header so the panel
      // layouts (student/parent/coach/admin) don't need a second profile
      // query just to decide whether to show the admin view switcher.
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-user-role", profile.role);
      const nextResponse = NextResponse.next({ request: { headers: requestHeaders } });
      // Carry over any Set-Cookie already queued by the auth-refresh
      // callback above — building a new NextResponse here would otherwise
      // silently drop a refreshed session cookie.
      supabaseResponse.cookies.getAll().forEach((c) => nextResponse.cookies.set(c));
      supabaseResponse = nextResponse;
    }
  }

  return supabaseResponse;
}
