import { describe, expect, it } from "vitest";

import { applyRememberMeCookieOptions, REMEMBER_ME_MAX_AGE_SECONDS } from "./remember-me";

const AUTH = "sb-abc-auth-token";

describe("applyRememberMeCookieOptions", () => {
  it("makes the auth cookie a session cookie when unchecked", () => {
    const out = applyRememberMeCookieOptions(AUTH, { maxAge: 34560000, path: "/" }, false);
    expect(out.maxAge).toBeUndefined();
    expect(out.expires).toBeUndefined();
    expect(out.path).toBe("/");
  });

  it("gives the auth cookie a 30-day lifetime when checked (chunked names too)", () => {
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
