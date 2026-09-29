import { describe, expect, it } from "vitest";
import { LGS_COURSES, TYT_COURSES, type Course } from "./index";
import { courseHasKonu, flattenCourseRows, flattenSelectionRows } from "./rows";

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

describe("flattenSelectionRows", () => {
  it("is a 1:1 reshape of flattenCourseRows for a non-LGS course -- nothing rolls up", () => {
    for (const course of TYT_COURSES) {
      const plain = flattenCourseRows(course);
      const selection = flattenSelectionRows(course);
      expect(selection).toHaveLength(plain.length);
      selection.forEach((row, i) => {
        expect(row.id).toBe(plain[i].topic.id);
        expect(row.label).toBe(plain[i].topic.name);
        expect(row.unitRowSpan).toBe(plain[i].unitRowSpan);
        expect(row.readOnlyNames).toEqual([]);
        expect(row.memberTopicIds).toEqual([plain[i].topic.id]);
      });
    }
  });

  it("collapses LGS Matematik to one row per Konu, spanning the Ünite column across its Konu rows", () => {
    const course = LGS_COURSES.find((c) => c.id === "lgs-matematik")!;
    const rows = flattenSelectionRows(course);
    // 12 (unit, konu) entries in lgs.json -> 12 selectable rows, never one per Alt Konu.
    expect(rows).toHaveLength(course.units.length);
    const first = rows[0];
    expect(first.label).toBe("1.1 Çarpanlar ve Katlar");
    expect(first.readOnlyNames).toEqual(["Pozitif Tam Sayıların Pozitif Tam Sayı Çarpanları", "EKOK", "EBOB"]);
    // "1. ÜNİTE" holds konu 1.1 and 1.2 -> its Ünite cell spans both rows.
    expect(rows[0].unitRowSpan).toBe(2);
    expect(rows[1].unitRowSpan).toBeNull();
  });

  it("collapses LGS Türkçe to exactly one row per Ünite, each carrying its own topics as read-only", () => {
    const course = LGS_COURSES.find((c) => c.id === "lgs-turkce")!;
    const rows = flattenSelectionRows(course);
    expect(rows).toHaveLength(course.units.length);
    rows.forEach((row, i) => {
      expect(row.label).toBe(course.units[i].unit);
      expect(row.unitRowSpan).toBe(1); // each Ünite is its own single selectable row now
      expect(row.readOnlyNames).toEqual(course.units[i].topics.map((t) => t.name));
    });
  });

  it("never drops a topic -- every course's rows cover every original topic id exactly once", () => {
    for (const course of [...TYT_COURSES, ...LGS_COURSES]) {
      const topicIds = course.units.flatMap((u) => u.topics.map((t) => t.id));
      const covered = flattenSelectionRows(course).flatMap((r) => r.memberTopicIds);
      expect(covered.sort()).toEqual([...topicIds].sort());
    }
  });
});
