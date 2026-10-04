import { describe, expect, it } from "vitest";

import { friendlyError, isTechnicalMessage } from "./friendly-error";

const WHAT = "Kaydedilemedi, tekrar dene.";
const REACT_441 =
  "Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";

describe("friendlyError", () => {
  it("keeps a message that was already written for the student", () => {
    expect(friendlyError(new Error("Bu görev sana ait değil."), WHAT)).toBe("Bu görev sana ait değil.");
    expect(friendlyError(new Error("Hem başlangıç hem bitiş sayfasını gir."), WHAT)).toBe("Hem başlangıç hem bitiş sayfasını gir.");
  });

  it("explains the production Server Action digest instead of showing it", () => {
    const out = friendlyError(new Error(REACT_441), WHAT);
    expect(out).not.toMatch(/react|441|https?:/i);
    expect(out.startsWith("Kaydedilemedi, tekrar dene.")).toBe(true);
    expect(out).toContain("Kaydın yapılmış olabilir");
    expect(friendlyError(new Error("An error occurred in the Server Components render."), WHAT)).toContain("Nedeni:");
  });

  it("names the likely cause for the other technical failures", () => {
    expect(friendlyError(new TypeError("Failed to fetch"), WHAT)).toContain("internet bağlantın");
    expect(friendlyError(new Error("Load failed"), WHAT)).toContain("internet bağlantın");
    expect(friendlyError(new Error("Failed to find Server Action \"abc\". This request might be from an older or newer deployment."), WHAT)).toContain("yeni bir sürüme");
    expect(friendlyError(new Error("Body exceeded 1 MB limit."), WHAT)).toContain("çok büyük");
    expect(friendlyError(new Error("504 Gateway Timeout"), WHAT)).toContain("zamanında yanıt vermedi");
  });

  it("never lets a URL or stack frame through", () => {
    expect(friendlyError(new Error("see https://example.com/x for details"), WHAT)).not.toMatch(/https?:/);
    expect(isTechnicalMessage("at foo (/app/x.js:10:5)")).toBe(true);
  });

  it("falls back to the call site's sentence for an empty or non-Error value", () => {
    expect(friendlyError(undefined, WHAT)).toBe(WHAT);
    expect(friendlyError(new Error(""), WHAT)).toBe(WHAT);
    expect(friendlyError({ weird: true }, WHAT)).toBe(WHAT);
    expect(friendlyError(null)).toBe("İşlem tamamlanamadı.");
  });

  it("accepts a plain string error", () => {
    expect(friendlyError("Minified React error #441", WHAT)).toContain("Nedeni:");
    expect(friendlyError("Oturum bulunamadı.", WHAT)).toBe("Oturum bulunamadı.");
  });
});
