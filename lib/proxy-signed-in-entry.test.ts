import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The proxy (lib/supabase/middleware.ts updateSession) with the Supabase client faked: what a person who is ALREADY signed in gets
// when they open the site, the sign-in page or the home-screen app, and what happens to a session refresh on a redirect.

type Profile = { role: string | null; is_active: boolean | null } | null;
let user: { id: string } | null = { id: "u1" };
let profile: Profile = { role: "student", is_active: true };
// When set, getUser() "refreshes the token": it calls the client's setAll with these cookies, as @supabase/ssr does.
let refreshCookies: { name: string; value: string; options: Record<string, unknown> }[] | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { setAll: (c: unknown[]) => void } }) => ({
    auth: {
      getUser: async () => {
        if (refreshCookies) opts.cookies.setAll(refreshCookies);
        return { data: { user } };
      },
    },
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) b[m] = () => b;
      b.single = async () => ({ data: profile, error: null });
      b.maybeSingle = async () => ({ data: profile, error: null });
      return b;
    },
  }),
}));

import { updateSession } from "@/lib/supabase/middleware";

const req = (path: string, init: { method?: string; cookie?: string } = {}) =>
  new NextRequest(`https://app.example.com${path}`, { method: init.method ?? "GET", headers: init.cookie ? { cookie: init.cookie } : {} });
const location = (res: Response) => (res.headers.get("location") ? new URL(res.headers.get("location")!).pathname : null);

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  user = { id: "u1" };
  profile = { role: "student", is_active: true };
  refreshCookies = null;
});

describe("a signed-in person opening the site is taken to their panel (the 'logged out when I close the app' bug)", () => {
  it.each([
    ["student", "/student"],
    ["parent", "/parent"],
    ["coach", "/coach"],
    ["admin", "/admin"],
  ])("%s on / , /login and /team goes straight to %s", async (role, home) => {
    profile = { role, is_active: true };
    for (const path of ["/", "/login", "/login?role=coach", "/team"]) {
      const res = await updateSession(req(path));
      expect(location(res), `${role} ${path}`).toBe(home);
    }
  });

  it("a signed-out visitor still sees the chooser and the sign-in page", async () => {
    user = null;
    for (const path of ["/", "/login", "/team"]) {
      const res = await updateSession(req(path));
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  it("never redirects the sign-in Server Action (a POST to /login), nor anything that is not a plain page load", async () => {
    for (const method of ["POST", "PUT"]) {
      const res = await updateSession(req("/login", { method }));
      expect(res.headers.get("location"), method).toBeNull();
    }
  });

  it("cannot loop: a deactivated account, or one with no valid role, stays on the page", async () => {
    profile = { role: "student", is_active: false };
    expect((await updateSession(req("/login"))).headers.get("location")).toBeNull();
    profile = { role: null, is_active: true };
    expect((await updateSession(req("/"))).headers.get("location")).toBeNull();
    profile = null;
    expect((await updateSession(req("/"))).headers.get("location")).toBeNull();
  });

  it("other public paths are left alone (no extra profile lookup, no redirect)", async () => {
    const res = await updateSession(req("/manifest.webmanifest"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("a redirect keeps the cookies of the session refresh", () => {
  const rotated = [
    { name: "sb-abcdefgh-auth-token", value: "base64-NEW", options: { path: "/", maxAge: 34_560_000, sameSite: "lax" } },
  ];

  it("the first visit after hours (token refreshed, then redirected to the panel) still sets the new auth cookie, with its long lifetime", async () => {
    refreshCookies = rotated;
    const res = await updateSession(req("/", { cookie: "sb-abcdefgh-auth-token=base64-OLD; remember_me=1" }));
    expect(location(res)).toBe("/student");
    const cookie = res.cookies.get("sb-abcdefgh-auth-token");
    expect(cookie?.value).toBe("base64-NEW");
    expect(cookie?.maxAge).toBe(34_560_000);
    expect(cookie?.expires).toBeInstanceOf(Date);
  });

  it("the same for the existing redirect to the right panel (role mismatch)", async () => {
    refreshCookies = rotated;
    profile = { role: "coach", is_active: true };
    const res = await updateSession(req("/student", { cookie: "sb-abcdefgh-auth-token=base64-OLD" }));
    expect(location(res)).toBe("/coach");
    expect(res.cookies.get("sb-abcdefgh-auth-token")?.value).toBe("base64-NEW");
  });

  it("an opted-out login stays a session cookie through the redirect", async () => {
    refreshCookies = rotated;
    const res = await updateSession(req("/", { cookie: "sb-abcdefgh-auth-token=base64-OLD; remember_me=0" }));
    expect(location(res)).toBe("/student");
    expect(res.cookies.get("sb-abcdefgh-auth-token")?.maxAge).toBeUndefined();
  });
});
