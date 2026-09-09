import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const COOKIE_NAME = "impersonation";

// Admin "view as student" was removed -- admins may no longer log in or
// view the platform as a student, so only "coach" remains a valid
// impersonation target.
export type ImpersonationRole = "coach";

// All 4 real roles a profile can have -- wider than ImpersonationRole
// (only coach supports the admin "view as" feature), since every
// dashboard layout needs a role check, not just that one.
export type AppRole = "student" | "parent" | "coach" | "admin";

const ROLE_HOME: Record<AppRole, string> = {
  student: "/student",
  parent: "/parent",
  coach: "/coach/dashboard",
  admin: "/admin",
};

export type ImpersonationState = {
  targetId: string;
  targetRole: ImpersonationRole;
  targetName: string;
};

function isImpersonationState(value: unknown): value is ImpersonationState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.targetId === "string" &&
    v.targetRole === "coach" &&
    typeof v.targetName === "string"
  );
}

async function readImpersonationCookie(): Promise<ImpersonationState | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isImpersonationState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function setImpersonationCookie(state: ImpersonationState) {
  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(state), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
  });
}

export async function clearImpersonationCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type ViewContext = {
  // Whose data to read -- the impersonation target's id when active and
  // legitimate, otherwise the real logged-in user's own id.
  effectiveUserId: string;
  isImpersonating: boolean;
  targetName: string | null;
};

// The cookie's content is NEVER trusted on its own -- the real logged-in
// user's admin status is re-checked against the DB on every call. A
// forged cookie from a non-admin session is simply ignored, falling back
// to that user's own real id. Even when honored, this only ever changes
// WHICH id an admin's own (already RLS-privileged) queries filter by --
// it can't grant access to anything admin's is_admin() bypass couldn't
// already read.
//
// Also the actual role-mismatch boundary: the caller's own profiles.role
// must match routeRole (impersonation aside). This used to be missing
// entirely -- any authenticated user got a valid, non-null ViewContext
// back for ANY routeRole, so a student who typed /coach/... in the URL
// bar was served their own id as if they were the coach, and the coach
// dashboard shell rendered around them. Only per-table RLS (coach_id =
// auth.uid()) kept the actual DATA empty; the page itself never refused
// to render. Returning null here on a mismatch is what lets every
// layout's requireViewContext() (below) turn that into a real redirect.
export async function getViewContext(routeRole: AppRole): Promise<ViewContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  const actualRole = profile?.role as AppRole | undefined;

  // A deactivated account (Pasife Al -- see admin/actions.ts setUserActive)
  // gets no view at all, regardless of role match. This intentionally
  // doesn't distinguish "inactive" from "wrong role" in the return value
  // -- requireViewContext (below) re-checks is_active itself when it
  // needs to decide between a normal redirect and a forced sign-out.
  if (profile?.is_active === false) return null;

  if (routeRole === "coach" && actualRole === "admin") {
    const state = await readImpersonationCookie();
    if (state) {
      return { effectiveUserId: state.targetId, isImpersonating: true, targetName: state.targetName };
    }
  }

  if (actualRole !== routeRole) return null;

  return { effectiveUserId: user.id, isImpersonating: false, targetName: null };
}

// The layout-level guard -- every one of the 4 dashboard layouts
// (admin/coach/parent/student) calls this before rendering anything.
// Unlike getViewContext (which stays a plain null-returning check, since
// 17+ page.tsx files already call it directly and degrade gracefully on
// null), this redirects: to /login if not authenticated at all, or to
// wherever the caller's REAL role actually belongs if they're logged in
// but on the wrong panel -- so a student hitting /coach/... lands back
// on /student instead of seeing a broken or empty coach shell.
export async function requireViewContext(routeRole: AppRole): Promise<ViewContext> {
  const view = await getViewContext(routeRole);
  if (view) return view;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();

  // Deactivated: terminate the session outright rather than just
  // redirecting. A plain redirect would leave them authenticated, so the
  // very next page load hits this same check again -- not an infinite
  // loop within one request, but an endless bounce back to a page they
  // can never actually use. Signing out breaks that for good.
  if (profile?.is_active === false) {
    await supabase.auth.signOut();
    redirect("/login?deactivated=1");
  }

  const actualRole = profile?.role as AppRole | undefined;
  redirect(actualRole ? ROLE_HOME[actualRole] : "/login");
}

// Called as the first line of every mutating coach/student server
// action. Fails closed on the mere PRESENCE of the cookie -- unlike
// getViewContext, this deliberately does NOT re-verify admin status
// first: even a self-inflicted fake cookie should only ever block
// writes, never allow them, so there's no need to trust the cookie to
// enforce this half.
export async function assertNotImpersonating() {
  const state = await readImpersonationCookie();
  if (state) {
    throw new Error("Görünüm modundasınız (salt okunur) -- değişiklik yapılamaz.");
  }
}
