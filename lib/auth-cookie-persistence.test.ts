import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// An end-to-end check of the sign-in cookies: the REAL @supabase/ssr client and the REAL cookie wrapper (lib/supabase/server.ts),
// with only the network (fetch) and Next's cookie store faked. It records the Set-Cookie options the browser would receive.

type SetCall = { name: string; value: string; options: Record<string, unknown> };
const sets: SetCall[] = [];
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      sets.push({ name, value, options });
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

import { createClient } from "@/lib/supabase/server";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated" })}.sig`;
const session = {
  access_token: jwt,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "refresh-1",
  user: { id: "u1", aud: "authenticated", role: "authenticated", phone: "905551112233", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
};

const realFetch = globalThis.fetch;
beforeEach(() => {
  sets.length = 0;
  jar.clear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  globalThis.fetch = (async () => new Response(JSON.stringify(session), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const authCookies = () => sets.filter((s) => /^sb-.*-auth-token(\.\d+)?$/.test(s.name) && s.value !== "");

describe("the cookies a sign-in really writes", () => {
  it("remembered: every auth cookie carries Max-Age AND Expires of 400 days (a persistent cookie, not a session one)", async () => {
    const supabase = await createClient({ rememberMe: true });
    const { error } = await supabase.auth.signInWithPassword({ phone: "905551112233", password: "x" });
    expect(error).toBeNull();
    const cookies = authCookies();
    expect(cookies.length).toBeGreaterThan(0);
    for (const c of cookies) {
      expect(c.options.maxAge, c.name).toBe(34_560_000);
      expect(c.options.expires, c.name).toBeInstanceOf(Date);
      const days = ((c.options.expires as Date).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(399.9);
      expect(c.options.path).toBe("/");
    }
  });

  it("not remembered (the explicit opt-out): the auth cookies are session cookies, with no Max-Age and no Expires", async () => {
    const supabase = await createClient({ rememberMe: false });
    await supabase.auth.signInWithPassword({ phone: "905551112233", password: "x" });
    const cookies = authCookies();
    expect(cookies.length).toBeGreaterThan(0);
    for (const c of cookies) {
      expect(c.options.maxAge, c.name).toBeUndefined();
      expect(c.options.expires, c.name).toBeUndefined();
    }
  });

  it("with no marker and no explicit choice (a refresh for an existing login) the cookies are rewritten as persistent ones", async () => {
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ phone: "905551112233", password: "x" });
    for (const c of authCookies()) expect(c.options.maxAge, c.name).toBe(34_560_000);
  });

  it("the opt-out marker makes later refreshes session cookies again", async () => {
    jar.set("remember_me", "0");
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ phone: "905551112233", password: "x" });
    for (const c of authCookies()) expect(c.options.maxAge, c.name).toBeUndefined();
  });
});
