import { describe, expect, it } from "vitest";

import { LGS_COURSES, toTurkishTitleCase } from "./index";
import { withoutLgsMasters } from "./lgs-masters";
import { lgsNodeIdForTopicId, lgsSelectionNodes } from "./lgs-selection";

function courseById(id: string) {
  const c = LGS_COURSES.find((c) => c.id === id);
  if (!c) throw new Error(`missing course ${id}`);
  return c;
}

// The course as lgs.json defines it, without the generated unit masters (lib/curriculum/lgs-masters.ts): the rollup rules
// below are about the workbook's own structure.
function nativeById(id: string) {
  return withoutLgsMasters(courseById(id));
}

describe("lgsSelectionNodes", () => {
  it("Matematik: one selectable node per Konu, id is a real topic id, all Alt Konu names kept read-only", () => {
    const nodes = lgsSelectionNodes(courseById("lgs-matematik"));
    const carpanlarVeKatlar = nodes.find((n) => n.label === "Çarpanlar ve Katlar");
    expect(carpanlarVeKatlar).toMatchObject({
      id: "lgs-matematik-u0-t0",
      unitLabel: "1. Ünite",
      readOnlyNames: ["Pozitif Tam Sayıların Pozitif Tam Sayı Çarpanları", "EKOK", "EBOB"],
      memberTopicIds: ["lgs-matematik-u0-t0", "lgs-matematik-u0-t1", "lgs-matematik-u0-t2"],
    });
    // Every node must be a real topic id, never a synthetic one --
    // validatePipelineStep (lib/topic-pipeline.ts) requires this.
    const allTopicIds = new Set(courseById("lgs-matematik").units.flatMap((u) => u.topics.map((t) => t.id)));
    for (const n of nodes) expect(allTopicIds.has(n.id)).toBe(true);
  });

  it("Fen Bilimleri: every Konu of Ünite 1-6 is its own node (a real topic id); Ünite 7 keeps its Konu-level rollup", () => {
    const course = nativeById("lgs-fen-bilimleri");
    const nodes = lgsSelectionNodes(course);

    // Ünite 1 ("1. ÜNİTE: MEVSİMLER VE İKLİM" in the raw data) lists its two Konu as topics: each is a selectable node,
    // nothing is rolled up under the Ünite any more.
    expect(nodes.filter((n) => n.unitLabel === "1. Ünite: Mevsimler ve İklim")).toMatchObject([
      { id: "lgs-fen-bilimleri-u0-t0", label: "Mevsimlerin Oluşumu", readOnlyNames: [], memberTopicIds: ["lgs-fen-bilimleri-u0-t0"] },
      { id: "lgs-fen-bilimleri-u0-t1", label: "İklim ve Hava Hareketleri", readOnlyNames: [], memberTopicIds: ["lgs-fen-bilimleri-u0-t1"] },
    ]);
    expect(nodes.find((n) => n.label === "1. Ünite: Mevsimler ve İklim")).toBeUndefined(); // the Ünite itself is not a node

    // Ünite 7 ("... ELEKTRİK ...") keeps rolling up at the Konu level.
    const rolledGroup = nodes.find((n) => n.label === "Elektrik Yükleri ve Elektriklenme");
    expect(rolledGroup).toMatchObject({
      readOnlyNames: ["Sürtünme ile Elektriklenme", "Dokunma ile Elektriklenme", "Etki (Tesir) ile Etkilenme"],
    });
    expect(nodes.find((n) => n.label.startsWith("7. Ünite"))).toBeUndefined();

    // Ünite 1-6: one node per topic; Ünite 7: one per Konu entry (3). 2+5+4+6+6+4 + 3 = 30.
    const plainTopics = course.units.filter((u) => u.konu === undefined).flatMap((u) => u.topics);
    const unite7KonuCount = course.units.filter((u) => u.konu !== undefined).length;
    expect(nodes).toHaveLength(plainTopics.length + unite7KonuCount);
    expect(nodes).toHaveLength(30);
  });

  it("Türkçe and İnkılap Tarihi: selectable node is the Ünite itself (Title Cased), topics become read-only", () => {
    for (const courseId of ["lgs-turkce", "lgs-inkilap-tarihi"]) {
      const course = courseById(courseId);
      const nodes = lgsSelectionNodes(course);
      // One node per unit, in the exact original unit count/order.
      expect(nodes).toHaveLength(course.units.length);
      nodes.forEach((n, i) => {
        expect(n.label).toBe(toTurkishTitleCase(course.units[i].unit));
        expect(n.readOnlyNames).toEqual(course.units[i].topics.map((t) => t.name));
        expect(n.id).toBe(course.units[i].topics[0].id);
      });
    }
  });

  it("İngilizce: unchanged -- every 'Unit N' topic stays its own selectable leaf", () => {
    const course = courseById("lgs-ingilizce");
    const nodes = lgsSelectionNodes(course);
    const allTopics = course.units.flatMap((u) => u.topics);
    expect(nodes).toHaveLength(allTopics.length);
    nodes.forEach((n, i) => {
      expect(n.id).toBe(allTopics[i].id);
      expect(n.label).toBe(allTopics[i].name);
      expect(n.readOnlyNames).toEqual([]);
    });
  });

  it("Din Kültürü: 5 main units are selectable, peygamber/sure items stay individually selectable", () => {
    const course = courseById("lgs-din-kulturu");
    const nodes = lgsSelectionNodes(course);
    const groupLabels = nodes.filter((n) => n.readOnlyNames.length > 0).map((n) => n.label);
    expect(groupLabels).toEqual([
      "Kader ve Kaza İnancı",
      "Zekat ve Sadaka",
      "Din, Birey ve Toplum",
      "Hz. Muhammed (s.a.v)",
      "İslam Dininin Temel Kaynakları",
    ]);

    const exemptLabels = nodes.filter((n) => n.readOnlyNames.length === 0).map((n) => n.label);
    expect(exemptLabels).toEqual([
      "Bir Peygamber Tanıyorum: Hz. Musa",
      "Bir Ayet Tanıyorum: Ayet El Kürsi ve Anlamı",
      "Bir Peygamber Tanıyorum: Hz. Şuayb",
      "Bir Sure Tanıyorum: Maun Suresi ve Anlamı",
      "Bir Peygamber Tanıyorum: Hz. Yusuf",
      "Bir Sure Tanıyorum: Asr Suresi ve Anlamı",
      "Bir Sure Tanıyorum: Kureyş Suresi ve Anlamı",
      "Bir Peygamber Tanıyorum: Hz. Nuh",
    ]);

    // Nothing lost: every original topic in the course is covered exactly
    // once across all nodes' memberTopicIds.
    const allTopicIds = course.units.flatMap((u) => u.topics.map((t) => t.id));
    const coveredIds = nodes.flatMap((n) => n.memberTopicIds);
    expect(coveredIds.sort()).toEqual([...allTopicIds].sort());
    expect(new Set(coveredIds).size).toBe(coveredIds.length);
  });

  it("every LGS course's nodes cover every one of its topics exactly once (nothing dropped, nothing duplicated)", () => {
    for (const course of LGS_COURSES) {
      const allTopicIds = course.units.flatMap((u) => u.topics.map((t) => t.id));
      const coveredIds = lgsSelectionNodes(course).flatMap((n) => n.memberTopicIds);
      expect(coveredIds.sort()).toEqual([...allTopicIds].sort());
      expect(new Set(coveredIds).size).toBe(coveredIds.length);
    }
  });
});

describe("lgsNodeIdForTopicId", () => {
  it("folds an old granular Alt Konu id onto its Konu group's representative id", () => {
    const course = courseById("lgs-matematik");
    expect(lgsNodeIdForTopicId(course, "lgs-matematik-u0-t1")).toBe("lgs-matematik-u0-t0"); // EKOK -> Çarpanlar ve Katlar
    expect(lgsNodeIdForTopicId(course, "lgs-matematik-u0-t0")).toBe("lgs-matematik-u0-t0"); // representative maps to itself
  });

  it("leaves an id that belongs to no node (karma, unknown) unchanged", () => {
    const course = courseById("lgs-matematik");
    expect(lgsNodeIdForTopicId(course, "karma")).toBe("karma");
  });

  it("leaves an individually selectable leaf's id unchanged", () => {
    const course = courseById("lgs-din-kulturu");
    expect(lgsNodeIdForTopicId(course, "lgs-din-kulturu-u0-t4")).toBe("lgs-din-kulturu-u0-t4"); // Hz. Musa
  });
});
