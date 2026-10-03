import { describe, expect, it } from "vitest";

import { findCourseById, isMaarifCourseId } from "./index";
import { MAARIF11_COURSE_TRACKS, MAARIF11_KAYNAK_COURSES, isMaarif11CourseId, tracksForMaarif11Course } from "./maarif11";
import rawJson from "./maarif11.json";
import { flattenSelectionRows } from "./rows";
import { MAARIF_GRADES } from "../maarif-grade";
import { subjectBackgroundClass } from "../subject-colors";
import { validatePipelineStep } from "../topic-pipeline";

const topicCount = (c: { units: { topics: unknown[] }[] }) => c.units.reduce((n, u) => n + u.topics.length, 0);
const course = (id: string) => MAARIF11_KAYNAK_COURSES.find((c) => c.id === id)!;
const raw = (id: string) => (rawJson as { id: string; units: { unit: string; topics: { id: string; name: string }[] }[] }[]).find((c) => c.id === id)!;

describe("maarif11 curriculum data", () => {
  it("has the eight subjects with the list's unit and topic counts", () => {
    const shape = Object.fromEntries(MAARIF11_KAYNAK_COURSES.map((c) => [c.name, [c.units.length, topicCount(c)]]));
    expect(shape).toEqual({
      "11. Sınıf Matematik": [5, 14],
      "11. Sınıf Fizik": [3, 33],
      "11. Sınıf Kimya": [3, 25],
      "11. Sınıf Biyoloji": [2, 26],
      "11. Sınıf Coğrafya": [7, 19],
      "11. Sınıf Tarih": [3, 11],
      "11. Sınıf Türk Dili ve Edebiyatı": [4, 24],
      "11. Sınıf Felsefe": [6, 17],
    });
  });

  it("has unique, maarif11-prefixed ids and no empty names", () => {
    const ids = MAARIF11_KAYNAK_COURSES.flatMap((c) => [c.id, ...c.units.flatMap((u) => u.topics.map((t) => t.id))]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of MAARIF11_KAYNAK_COURSES) {
      expect(isMaarif11CourseId(c.id)).toBe(true);
      for (const u of c.units) {
        expect(u.unit).toBeTruthy();
        for (const t of u.topics) expect(t.name.trim()).not.toBe("");
      }
    }
  });

  it("nests sub-topics under their parent topic with ' › ', leaving childless topics as plain leaves", () => {
    // Raw data keeps the numbering (it carries the ordering) ...
    const fizik = raw("maarif11-fizik").units[0].topics.map((t) => t.name);
    expect(fizik.slice(0, 4)).toEqual([
      "1.1. Serbest Düşme › 1.1.1. Serbest Düşen Cisimler",
      "1.1. Serbest Düşme › 1.1.2. Serbest Düşme Hareketi İle İlgili Veriler",
      "1.2. İki Boyutta Sabit İvmeli Hareket",
      "1.3. Newton'ın Hareket Yasaları › 1.3.1. Bileşke Kuvvet ve Hareket Arasındaki İlişki",
    ]);
    // ... and the displayed names have none of it.
    expect(course("maarif11-fizik").units[0].topics.slice(0, 3).map((t) => t.name)).toEqual([
      "Serbest Düşme › Serbest Düşen Cisimler",
      "Serbest Düşme › Serbest Düşme Hareketi İle İlgili Veriler",
      "İki Boyutta Sabit İvmeli Hareket",
    ]);
  });

  it("strips numbering from every displayed name, but keeps it in the raw data", () => {
    const marker = /(^|\s›\s)\d+(\.\d+)*\.\s/;
    for (const c of MAARIF11_KAYNAK_COURSES) for (const u of c.units) for (const t of u.topics) expect(t.name).not.toMatch(marker);
    const rawNames = (rawJson as { units: { topics: { name: string }[] }[] }[]).flatMap((c) => c.units.flatMap((u) => u.topics.map((t) => t.name)));
    expect(rawNames.every((n) => /^\d+\.\d+\. /.test(n))).toBe(true);
  });

  it("keeps a topic that merely starts with a year, e.g. Tarih's 1755 Lizbon depremi", () => {
    const names = course("maarif11-tarih").units[0].topics.map((t) => t.name);
    expect(names).toContain("1755 Lizbon ve 1766 İstanbul Depremlerinin Etkileri");
    expect(names[0]).toBe("Osmanlı Devleti’nin 1683-1789 Yılları Arasındaki Siyasi ve Askerî Mücadeleleri");
  });

  it("keeps the raw data in the list's order, with unit labels normalised", () => {
    expect(course("maarif11-matematik").units.map((u) => u.unit)).toEqual([
      "1. Ünite: İstatistiksel Araştırma Süreci",
      "2. Ünite: Geometrik Şekiller",
      "3. Ünite: Nicelikler ve Değişimler (1)",
      "4. Ünite: Nicelikler ve Değişimler (2)",
      "5. Ünite: Nicelikler ve Değişimler (3)",
    ]);
    expect(course("maarif11-felsefe").units[0].unit).toBe("1. Ünite: Çevre Sorunları ve Felsefe");
    expect(course("maarif11-turk-dili-ve-edebiyati").units[0].unit).toBe("1. Tema: Bir Diyeceğim Var!");
    expect(course("maarif11-turk-dili-ve-edebiyati").units[0].topics[0].name).toBe("Metin Tahlili (Anlama): Okuma › Karagöz Oyunu (Yazıcı)");
  });
});

describe("maarif11 track mapping", () => {
  it("maps every course to the tracks the coach specified", () => {
    expect(MAARIF11_COURSE_TRACKS).toEqual({
      "maarif11-matematik": ["sayisal", "ea"],
      "maarif11-fizik": ["sayisal"],
      "maarif11-kimya": ["sayisal"],
      "maarif11-biyoloji": ["sayisal"],
      "maarif11-turk-dili-ve-edebiyati": ["sayisal", "ea", "sozel"],
      "maarif11-tarih": ["ea", "sozel"],
      "maarif11-cografya": ["ea", "sozel"],
      "maarif11-felsefe": ["ea", "sozel"],
    });
  });

  it("every course has at least one track and every track id is a real course", () => {
    for (const c of MAARIF11_KAYNAK_COURSES) expect(tracksForMaarif11Course(c.id).length).toBeGreaterThan(0);
    for (const id of Object.keys(MAARIF11_COURSE_TRACKS)) expect(MAARIF11_KAYNAK_COURSES.some((c) => c.id === id)).toBe(true);
  });

  it("each track lists the right subjects", () => {
    const inTrack = (t: "sayisal" | "ea" | "sozel") => MAARIF11_KAYNAK_COURSES.filter((c) => tracksForMaarif11Course(c.id).includes(t)).map((c) => c.id);
    expect(inTrack("sayisal")).toEqual(["maarif11-matematik", "maarif11-fizik", "maarif11-kimya", "maarif11-biyoloji", "maarif11-turk-dili-ve-edebiyati"]);
    // Chips follow the list's own subject order (Coğrafya, Tarih, Türk Dili, Felsefe).
    expect(inTrack("ea")).toEqual(["maarif11-matematik", "maarif11-cografya", "maarif11-tarih", "maarif11-turk-dili-ve-edebiyati", "maarif11-felsefe"]);
    expect(inTrack("sozel")).toEqual(["maarif11-cografya", "maarif11-tarih", "maarif11-turk-dili-ve-edebiyati", "maarif11-felsefe"]);
  });

  it("an unknown course has no tracks", () => {
    expect(tracksForMaarif11Course("maarif10-matematik")).toEqual([]);
  });
});

describe("maarif11 integration", () => {
  it("is the 11th grade's own course list, resolvable by id, and never leaks into another grade", () => {
    expect(MAARIF_GRADES[11].courses).toBe(MAARIF11_KAYNAK_COURSES);
    expect(MAARIF_GRADES[11].isCourseId("maarif11-fizik")).toBe(true);
    expect(MAARIF_GRADES[9].isCourseId("maarif11-fizik")).toBe(false);
    expect(MAARIF_GRADES[10].isCourseId("maarif11-fizik")).toBe(false);
    expect(findCourseById("maarif11-fizik")?.name).toBe("11. Sınıf Fizik");
    expect(isMaarifCourseId("maarif11-fizik")).toBe(true);
  });

  it("splits into one Kaynak Takibi row per heading group, keeping every subtopic as a member", () => {
    const fizik = course("maarif11-fizik");
    const rows = flattenSelectionRows(fizik);
    // Unit 1 alone has 6 headings (Serbest Düşme, İki Boyutta..., Newton'ın..., Sürtünme..., Limit Hız, Düzgün Çembersel Hareket).
    expect(rows.filter((r) => r.unitLabel === fizik.units[0].unit)).toHaveLength(6);
    expect(rows.length).toBeGreaterThan(fizik.units.length);
    expect(rows.flatMap((r) => r.memberTopicIds)).toEqual(fizik.units.flatMap((u) => u.topics.map((t) => t.id)));
    expect(rows[0].label).toBe("Serbest Düşme");
    expect(rows[0].memberTopicIds).toHaveLength(2);
  });

  it("an 11th grader can tick its pipeline steps (incl. Okul İlerlemesi); a 10th grader can't", () => {
    const fizik = course("maarif11-fizik");
    const input = (step: "okul_ilerlemesi" | "konu_calismasi") => ({ courseId: fizik.id, topicId: fizik.units[0].topics[1].id, step, value: true });
    expect(() => validatePipelineStep("YKS", input("okul_ilerlemesi"), 11)).not.toThrow();
    expect(() => validatePipelineStep("YKS", input("konu_calismasi"), 11)).not.toThrow();
    expect(() => validatePipelineStep("YKS", input("konu_calismasi"), 10)).toThrow("Geçersiz ders.");
    expect(() => validatePipelineStep("YKS", input("konu_calismasi"), null)).toThrow("Geçersiz ders.");
  });

  it("uses the same subject colours as the matching TYT subject", () => {
    const pairs: [string, string][] = [
      ["maarif11-matematik", "tyt-matematik"],
      ["maarif11-fizik", "tyt-fizik"],
      ["maarif11-kimya", "tyt-kimya"],
      ["maarif11-biyoloji", "tyt-biyoloji"],
      ["maarif11-tarih", "tyt-tarih"],
      ["maarif11-cografya", "tyt-cografya"],
      ["maarif11-felsefe", "tyt-felsefe"],
      ["maarif11-turk-dili-ve-edebiyati", "tyt-turkce"],
    ];
    for (const [eleven, tyt] of pairs) {
      expect(subjectBackgroundClass(eleven, "question_bank")).toBe(subjectBackgroundClass(tyt, "question_bank"));
      expect(subjectBackgroundClass(eleven, "question_bank")).not.toBe("bg-slate-500/10");
    }
  });
});
