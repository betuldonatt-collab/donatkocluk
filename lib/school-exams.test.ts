import { describe, expect, it } from "vitest";

import {
  checkCourseName,
  DEFAULT_SCHOOL_COURSES,
  defaultCourseName,
  formatGrade,
  isDefaultCourseKey,
  isSchoolColorKey,
  parseGrade,
  schoolCohortOf,
  schoolColor,
  SCHOOL_COLORS,
} from "./school-exams";

const names = (cohort: keyof typeof DEFAULT_SCHOOL_COURSES) => DEFAULT_SCHOOL_COURSES[cohort].map((c) => c.name);

describe("default courses per grade (exactly the coach's lists)", () => {
  it("LGS (8th)", () => {
    expect(names("lgs")).toEqual([
      "Matematik",
      "Türkçe",
      "Fen Bilimleri",
      "TC İnkılap Tarihi ve Atatürkçülük",
      "İngilizce",
      "Din Kültürü ve Ahlak Bilgisi",
    ]);
  });

  it("9th grade has no Felsefe", () => {
    expect(names("grade9")).toEqual([
      "Matematik",
      "Fizik",
      "Kimya",
      "Biyoloji",
      "İngilizce (Birinci Yabancı Dil)",
      "Almanca (İkinci Yabancı Dil)",
      "Türk Dili ve Edebiyatı",
      "Tarih",
      "Coğrafya",
      "Din Kültürü ve Ahlak Bilgisi",
    ]);
  });

  it("10th, 11th and 12th grade add Felsefe, with the same other courses in the same order", () => {
    for (const cohort of ["grade10", "grade11", "grade12"] as const) {
      expect(names(cohort)).toEqual([...names("grade9"), "Felsefe"]);
    }
  });

  it("is not narrowed by track: every Maarif/YKS grade keeps Tarih and Coğrafya next to Fizik/Kimya/Biyoloji", () => {
    for (const cohort of ["grade9", "grade10", "grade11", "grade12"] as const) {
      for (const n of ["Fizik", "Kimya", "Biyoloji", "Tarih", "Coğrafya"]) expect(names(cohort)).toContain(n);
    }
  });

  it("every cohort has unique course keys", () => {
    for (const list of Object.values(DEFAULT_SCHOOL_COURSES)) {
      const keys = list.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("looks a default course up by key within its own grade only", () => {
    expect(isDefaultCourseKey("grade12", "felsefe")).toBe(true);
    expect(isDefaultCourseKey("grade9", "felsefe")).toBe(false);
    expect(isDefaultCourseKey("lgs", "fizik")).toBe(false);
    expect(isDefaultCourseKey("lgs", "turkce")).toBe(true);
    expect(defaultCourseName("grade9", "almanca")).toBe("Almanca (İkinci Yabancı Dil)");
    expect(defaultCourseName("lgs", "almanca")).toBeNull();
  });
});

describe("schoolCohortOf", () => {
  const plain = { examType: "YKS" as const, maarifGrade: null, isGraduate: false };

  it("maps each kind of student to their school grade", () => {
    expect(schoolCohortOf({ ...plain, examType: "LGS" })).toBe("lgs");
    expect(schoolCohortOf({ ...plain, maarifGrade: 9 })).toBe("grade9");
    expect(schoolCohortOf({ ...plain, maarifGrade: 10 })).toBe("grade10");
    expect(schoolCohortOf({ ...plain, maarifGrade: 11 })).toBe("grade11");
    expect(schoolCohortOf(plain)).toBe("grade12");
  });

  it("a graduate (Mezun) has no school grade", () => {
    expect(schoolCohortOf({ ...plain, isGraduate: true })).toBeNull();
  });
});

describe("parseGrade", () => {
  it("empty means no grade", () => {
    expect(parseGrade("")).toEqual({ ok: true, value: null });
    expect(parseGrade("   ")).toEqual({ ok: true, value: null });
  });

  it("reads whole numbers and decimals with a comma or a dot", () => {
    expect(parseGrade("85")).toEqual({ ok: true, value: 85 });
    expect(parseGrade("85,5")).toEqual({ ok: true, value: 85.5 });
    expect(parseGrade("85.25")).toEqual({ ok: true, value: 85.25 });
    expect(parseGrade("0")).toEqual({ ok: true, value: 0 });
    expect(parseGrade("100")).toEqual({ ok: true, value: 100 });
  });

  it("refuses anything outside 0-100 or not a number", () => {
    for (const bad of ["101", "100,5", "-5", "abc", "8 5", "85,555", "1e2", "85,", ",5", "1000"]) {
      expect(parseGrade(bad).ok).toBe(false);
    }
  });

  it("formats a stored grade back with a comma and no trailing zeros", () => {
    expect(formatGrade(85.5)).toBe("85,5");
    expect(formatGrade(85)).toBe("85");
    expect(formatGrade(0)).toBe("0");
    expect(formatGrade(null)).toBe("");
  });
});

describe("checkCourseName", () => {
  it("trims and collapses spaces", () => {
    expect(checkCourseName("  Resim   Dersi ")).toEqual({ ok: true, name: "Resim Dersi" });
  });
  it("refuses empty and over-long names", () => {
    expect(checkCourseName("   ").ok).toBe(false);
    expect(checkCourseName("x".repeat(61)).ok).toBe(false);
    expect(checkCourseName("x".repeat(60)).ok).toBe(true);
  });
});

describe("pastel palette", () => {
  it("has 10 unique colours and recognises only its own keys", () => {
    expect(SCHOOL_COLORS).toHaveLength(10);
    expect(new Set(SCHOOL_COLORS.map((c) => c.key)).size).toBe(10);
    expect(isSchoolColorKey("mavi")).toBe(true);
    expect(isSchoolColorKey("neon-green")).toBe(false);
    expect(isSchoolColorKey(null)).toBe(false);
  });

  it("is pastel: every header/body/swatch uses a light shade (200-400 / 50-100), never a saturated 500+", () => {
    for (const c of SCHOOL_COLORS) {
      for (const cls of [c.header, c.body, c.swatch]) {
        const lightShades = cls.match(/(?<!dark:)bg-[a-z]+-(\d+)/g) ?? [];
        for (const m of lightShades) expect(Number(m.split("-").pop())).toBeLessThanOrEqual(400);
      }
    }
  });

  it("falls back to a position-based colour for a course with none chosen", () => {
    expect(schoolColor(null, 0).key).toBe("pembe");
    expect(schoolColor(null, 1).key).toBe("mavi");
    expect(schoolColor(null, 10).key).toBe("pembe");
    expect(schoolColor("mor", 0).key).toBe("mor");
    expect(schoolColor("bogus", 2).key).toBe("yesil");
  });
});
