import { describe, expect, it } from "vitest";

import { canAccessYazililar, isStudentNavItemVisible, YAZILILAR_HREF } from "./student-nav";
import { STUDENT_NAV_ITEMS } from "./tour-steps";

const base = { examType: "YKS" as const, isMaarif: false, isGraduate: false };
const hrefs = STUDENT_NAV_ITEMS.map((i) => i.href);
const visibleFor = (ctx: Parameters<typeof isStudentNavItemVisible>[1]) => hrefs.filter((h) => isStudentNavItemVisible(h, ctx));

describe("Yazılılar visibility", () => {
  it("is visible to every school student: 12th grade (plain YKS), 9th/10th/11th (Maarif) and LGS", () => {
    expect(isStudentNavItemVisible(YAZILILAR_HREF, base)).toBe(true); // 12. sınıf
    expect(isStudentNavItemVisible(YAZILILAR_HREF, { ...base, isMaarif: true })).toBe(true); // 9., 10., 11.
    expect(isStudentNavItemVisible(YAZILILAR_HREF, { ...base, examType: "LGS" })).toBe(true); // 8. sınıf and below
  });

  it("is completely hidden for a graduate (Mezun), in the menu and in the guided tour list", () => {
    expect(isStudentNavItemVisible(YAZILILAR_HREF, { ...base, isGraduate: true })).toBe(false);
    expect(visibleFor({ ...base, isGraduate: true })).not.toContain(YAZILILAR_HREF);
    expect(visibleFor(base)).toContain(YAZILILAR_HREF);
  });

  it("the page itself is closed to a graduate too", () => {
    expect(canAccessYazililar({ isGraduate: true })).toBe(false);
    expect(canAccessYazililar({ isGraduate: false })).toBe(true);
  });

  it("sits immediately below Deneme Analizleri in the menu list", () => {
    const i = hrefs.indexOf("/student/deneme-analizleri");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(hrefs[i + 1]).toBe(YAZILILAR_HREF);
  });

  it("hiding it for a graduate changes nothing else in the menu", () => {
    const withoutGraduate = visibleFor(base).filter((h) => h !== YAZILILAR_HREF);
    expect(visibleFor({ ...base, isGraduate: true })).toEqual(withoutGraduate);
  });
});

describe("the existing menu rules are unchanged", () => {
  it("Çıkmış Sorular is hidden for Maarif grades only; İngilizce Quiz is LGS-only", () => {
    expect(isStudentNavItemVisible("/student/cikmis-sorular", base)).toBe(true);
    expect(isStudentNavItemVisible("/student/cikmis-sorular", { ...base, isMaarif: true })).toBe(false);
    expect(isStudentNavItemVisible("/student/ingilizce-quiz", base)).toBe(false);
    expect(isStudentNavItemVisible("/student/ingilizce-quiz", { ...base, isMaarif: true })).toBe(false);
    expect(isStudentNavItemVisible("/student/ingilizce-quiz", { ...base, examType: "LGS" })).toBe(true);
    expect(isStudentNavItemVisible("/student/kaynak-takibi", { ...base, isGraduate: true, isMaarif: true })).toBe(true);
  });
});
