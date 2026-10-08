import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  applyRememberMeCookieOptions,
  isRememberMe,
  REMEMBER_ME_MAX_AGE_SECONDS,
  REMEMBER_ME_OPT_OUT_VALUE,
  rememberMeOptOutCookieOptions,
} from "./remember-me";

const AUTH = "sb-abc-auth-token";

describe("applyRememberMeCookieOptions", () => {
  it("makes the auth cookie a session cookie when unchecked", () => {
    const out = applyRememberMeCookieOptions(AUTH, { maxAge: 34560000, path: "/" }, false);
    expect(out.maxAge).toBeUndefined();
    expect(out.expires).toBeUndefined();
    expect(out.path).toBe("/");
  });

  it("gives the auth cookie the long lifetime when checked (chunked names too)", () => {
    for (const name of [AUTH, `${AUTH}.0`, `${AUTH}.1`]) {
      const out = applyRememberMeCookieOptions(name, { path: "/" }, true);
      expect(out.maxAge).toBe(REMEMBER_ME_MAX_AGE_SECONDS);
      expect(out.expires).toBeInstanceOf(Date);
    }
  });

  it("leaves non-auth cookies untouched", () => {
    const opts = { maxAge: 60 };
    expect(applyRememberMeCookieOptions("other", opts, true)).toBe(opts);
  });

  it("keeps removals (maxAge 0) as removals", () => {
    expect(applyRememberMeCookieOptions(AUTH, { maxAge: 0 }, true).maxAge).toBe(0);
    expect(applyRememberMeCookieOptions(AUTH, { maxAge: 0 }, false).maxAge).toBe(0);
  });
});

describe("staying signed in is the default (2026-10)", () => {
  it("lasts 400 days, the longest a browser keeps a cookie, as both Max-Age and Expires", () => {
    expect(REMEMBER_ME_MAX_AGE_SECONDS).toBe(400 * 24 * 60 * 60);
    const out = applyRememberMeCookieOptions(AUTH, { path: "/" }, true);
    expect(out.maxAge).toBe(34_560_000);
    const days = ((out.expires as Date).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(399.9);
    expect(days).toBeLessThanOrEqual(400);
  });

  it("only the explicit opt-out marker turns it off: no marker (existing logins, a cleared marker) still counts as remembered", () => {
    expect(isRememberMe(undefined)).toBe(true);
    expect(isRememberMe("1")).toBe(true);
    expect(isRememberMe("")).toBe(true);
    expect(isRememberMe(REMEMBER_ME_OPT_OUT_VALUE)).toBe(false);
    expect(isRememberMe("0")).toBe(false);
  });

  it("the opt-out marker is itself a session cookie (it ends with the browser session it describes)", () => {
    const o = rememberMeOptOutCookieOptions();
    expect(o.maxAge).toBeUndefined();
    expect(o.expires).toBeUndefined();
    expect(o.httpOnly).toBe(true);
  });

  it("a token refresh rewrites the auth cookies with the long lifetime, so an active user never falls back to a session cookie", () => {
    // the cookies Supabase hands to setAll after a refresh carry no (or its own) lifetime; remembered -> 400 days regardless
    for (const given of [{ path: "/" }, { path: "/", maxAge: 34_560_000 }]) {
      expect(applyRememberMeCookieOptions(`${AUTH}.0`, given, isRememberMe(undefined)).maxAge).toBe(REMEMBER_ME_MAX_AGE_SECONDS);
    }
  });

  it("the login form ticks the box by default and the sign-in action hands the choice straight to the cookie client", () => {
    const form = readFileSync(new URL("../app/login/login-form.tsx", import.meta.url), "utf8");
    expect(form).toMatch(/<Checkbox id="signin-remember-me" name="rememberMe" defaultChecked \/>/);
    const actions = readFileSync(new URL("../app/login/actions.ts", import.meta.url), "utf8");
    expect(actions).toContain("createClient({ rememberMe })");
    expect(actions).toContain("REMEMBER_ME_OPT_OUT_VALUE");
    // logging out still clears the marker, so nothing carries over to the next person on this browser
    expect(actions.slice(actions.indexOf("export async function signOut"))).toContain("cookieStore.delete(REMEMBER_ME_COOKIE_NAME)");
  });

  it("the proxy and the server client both read the marker through isRememberMe", () => {
    for (const file of ["../lib/supabase/middleware.ts", "../lib/supabase/server.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).toContain("isRememberMe(");
      expect(src, file).not.toMatch(/REMEMBER_ME_COOKIE_NAME\)\?\.value === "1"/);
    }
  });
});
