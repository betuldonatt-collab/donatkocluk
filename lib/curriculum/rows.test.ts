import { describe, expect, it } from "vitest";
import { LGS_COURSES, TYT_COURSES, type Course } from "./index";
import { courseHasKonu, flattenCourseRows } from "./rows";

const t = (id: string) => ({ id, name: id });

describe("flattenCourseRows", () => {
  it("gives a YKS-style course one span per unit entry and single-row '-' topics", () => {
    const course: Course = {
      id: "x",
      name: "X",
      units: [
        { unit: "-", topics: [t("a"), t("b")] },
        { unit: "Fiiller", topics: [t("c"), t("d"), t("e")] },
      ],
    };
    const rows = flattenCourseRows(course);
    expect(courseHasKonu(course)).toBe(false);
    expect(rows.map((r) => r.unitRowSpan)).toEqual([1, 1, 3, null, null]);
    expect(rows.every((r) => r.konuLabel === null && r.konuRowSpan === null)).toBe(true);
  });

  it("merges consecutive same-unit LGS entries into one Ünite span and spans each Konu", () => {
    const course: Course = {
      id: "lgs-x",
      name: "X",
      units: [
        { unit: "1. Ünite", konu: "1.1 Konu", topics: [t("a"), t("b")] },
        { unit: "1. Ünite", konu: "1.2 Konu", topics: [t("c")] },
        { unit: "2. Ünite", konu: "2.1 Konu", topics: [t("d"), t("e")] },
      ],
    };
    const rows = flattenCourseRows(course);
    expect(courseHasKonu(course)).toBe(true);
    // Ünite: 1. Ünite covers 3 rows, 2. Ünite covers 2.
    expect(rows.map((r) => r.unitRowSpan)).toEqual([3, null, null, 2, null]);
    // Konu: one span per (Ünite, Konu) entry, sized to its Alt Konu count.
    expect(rows.map((r) => r.konuRowSpan)).toEqual([2, null, 1, 2, null]);
    expect(rows.map((r) => r.konuLabel)).toEqual(["1.1 Konu", "1.1 Konu", "1.2 Konu", "2.1 Konu", "2.1 Konu"]);
  });

  it("emits exactly one row per topic for every bundled course", () => {
    for (const course of [...TYT_COURSES, ...LGS_COURSES]) {
      const topicCount = course.units.reduce((n, u) => n + u.topics.length, 0);
      const rows = flattenCourseRows(course);
      expect(rows).toHaveLength(topicCount);
      // Every Ünite span must add up to the rows it claims to cover.
      const spanTotal = rows.reduce((n, r) => n + (r.unitRowSpan ?? 0), 0);
      expect(spanTotal).toBe(topicCount);
    }
  });
});
