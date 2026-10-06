import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TopicGroupSelect } from "@/components/topic-group-select";
import { findCourseById, topicOptionsForCourse } from "./curriculum";
import { MAARIF_TYT_MERGED_COURSES } from "./curriculum/maarif-tyt";
import { maarifSelectionNodes } from "./curriculum/maarif-selection";
import { flattenSelectionRows } from "./curriculum/rows";
import { groupOfTopic, mainTopicOptions, topicGroups, unitMasterId, withoutUnitMasters } from "./curriculum/topic-groups";

const course = (id: string) => MAARIF_TYT_MERGED_COURSES.find((c) => c.id === id)!;
const isMasterId = (id: string) => /-genel-u\d+$/.test(id);
const distinctLabels = (c: { units: { unit: string }[] }) => [...new Set(c.units.map((u) => u.unit))];
const topicsOfLabel = (c: { units: { unit: string; topics: { id: string; name: string }[] }[] }, label: string) => c.units.filter((u) => u.unit === label).flatMap((u) => u.topics);

describe("every Maarif TYT unit with two or more topics has its '(Genel)' master", () => {
  it("one master per such unit, none for a one-topic unit, none for the flat Türkçe course", () => {
    for (const c of MAARIF_TYT_MERGED_COURSES) {
      const native = withoutUnitMasters(c);
      const expected = distinctLabels(native).filter((l) => l !== "" && topicsOfLabel(native, l).length >= 2);
      expect(topicGroups(c).map((g) => g.unitLabel), c.id).toEqual(expected);
      const masters = c.units.flatMap((u) => u.topics).filter((t) => isMasterId(t.id));
      expect(masters, c.id).toHaveLength(expected.length);
    }
    expect(topicGroups(course("maarif-tyt-turk-dili-ve-edebiyati"))).toEqual([]);
    expect(topicGroups(course("maarif-tyt-felsefe"))).toEqual([]); // nine one-topic units
    expect(topicGroups(course("maarif-tyt-matematik")).map((g) => g.unitLabel)).not.toContain("7. Tema: Sayma");
    expect(topicGroups(course("maarif-tyt-fizik"))).toHaveLength(8);
    expect(topicGroups(course("maarif-tyt-din-kulturu"))).toHaveLength(10);
  });

  it("the subtopics of a unit are all of its native topics, across its buckets", () => {
    const fizik = course("maarif-tyt-fizik");
    const native = withoutUnitMasters(fizik);
    for (const g of topicGroups(fizik)) {
      expect(g.members.map((t) => t.id), g.unitLabel).toEqual(topicsOfLabel(native, g.unitLabel).map((t) => t.id));
    }
    const dalgalar = topicGroups(fizik).find((g) => g.unitLabel === "8. Ünite: Dalgalar")!;
    expect(dalgalar.members).toHaveLength(6);
  });

  it("a master's name never starts with a number, keeps the grade tag, and is unique within its course", () => {
    for (const c of MAARIF_TYT_MERGED_COURSES) {
      const names = c.units.flatMap((u) => u.topics).filter((t) => isMasterId(t.id)).map((t) => t.name);
      for (const n of names) {
        expect(n.endsWith(" (Genel)"), n).toBe(true);
        expect(n, n).not.toMatch(/^\d/);
      }
      expect(new Set(names).size, c.id).toBe(names.length);
    }
    const din = course("maarif-tyt-din-kulturu");
    expect(din.units[0].topics.at(-1)!.name).toBe("(9. Sınıf) Allah İnsan İlişkisi (Genel)");
  });

  it("two units that share a title say which one they are", () => {
    const mat = course("maarif-tyt-matematik");
    const names = mat.units.flatMap((u) => u.topics).filter((t) => isMasterId(t.id)).map((t) => t.name);
    expect(names).toContain("Sayılar — 1. Tema (Genel)");
    expect(names).toContain("Sayılar — 3. Tema (Genel)");
    expect(names).toContain("Nicelikler ve Değişimler — 2. Tema (Genel)");
    expect(names).toContain("Nicelikler ve Değişimler — 5. Tema (Genel)");
    expect(names).toContain("Algoritma ve Bilişim (Genel)"); // a title that is unique stays plain
  });

  it("master ids are unique and follow the unit's position among the course's units", () => {
    for (const c of MAARIF_TYT_MERGED_COURSES) {
      const ids = c.units.flatMap((u) => u.topics.map((t) => t.id));
      expect(new Set(ids).size, c.id).toBe(ids.length);
    }
    const fizik = course("maarif-tyt-fizik");
    const labels = distinctLabels(fizik);
    for (const g of topicGroups(fizik)) expect(g.masterId).toBe(unitMasterId(fizik.id, labels.indexOf(g.unitLabel)));
  });
});

describe("where the master sits, and that nothing else moves", () => {
  it("a bucketed unit gets one more bucket entry (the master, last in the unit); a plain unit gets it as its last topic", () => {
    const fizik = course("maarif-tyt-fizik");
    const unit1 = fizik.units.filter((u) => u.unit === "1. Ünite: Fizik Bilimi ve Kariyer Keşfi");
    const last = unit1[unit1.length - 1];
    expect(last.bucket).toBe("Fizik Bilimi ve Kariyer Keşfi (Genel)");
    expect(last.topics).toHaveLength(1);
    expect(isMasterId(last.topics[0].id)).toBe(true);
    const din = course("maarif-tyt-din-kulturu");
    expect(din.units[0].bucket).toBeUndefined();
    expect(isMasterId(din.units[0].topics.at(-1)!.id)).toBe(true);
    expect(din.units[0].topics).toHaveLength(5); // 4 native + the master
  });

  it("every existing Kaynak Takibi row keeps its id (saved ticks are keyed by it), and every master is counted in a row", () => {
    for (const c of MAARIF_TYT_MERGED_COURSES) {
      const before = maarifSelectionNodes(withoutUnitMasters(c));
      const after = maarifSelectionNodes(c);
      const afterIds = new Set(after.map((n) => n.id));
      for (const n of before) {
        expect(afterIds.has(n.id), `${c.id} ${n.id}`).toBe(true);
        // the row's members are the same ones as before (a master never joins an existing row)
        const now = after.find((x) => x.id === n.id)!;
        if (c.id !== "maarif-tyt-din-kulturu") expect(now.memberTopicIds).toEqual(n.memberTopicIds);
      }
      const rows = flattenSelectionRows(c);
      // a bucketed unit's master is a row of its own; in a plain unit it is a member of the unit's last row (stats still counted)
      for (const g of topicGroups(c)) {
        const own = rows.some((r) => r.id === g.masterId);
        expect(own || rows.some((r) => r.memberTopicIds.includes(g.masterId)), `${c.id} ${g.masterId}`).toBe(true);
        if (c.units.some((u) => u.unit === g.unitLabel && u.bucket !== undefined)) expect(own, g.masterId).toBe(true);
      }
    }
  });

  it("the source courses (9th / 10th grade) and the 11th grade's own courses are untouched", () => {
    expect(findCourseById("maarif9-fizik")!.units.some((u) => u.topics.some((t) => isMasterId(t.id)))).toBe(false);
    expect(findCourseById("maarif10-matematik")!.units.some((u) => u.topics.some((t) => isMasterId(t.id)))).toBe(false);
  });
});

describe("assigning: the Ünite as a whole, or one Alt Başlık", () => {
  const fizik = course("maarif-tyt-fizik");
  const main = mainTopicOptions(fizik, topicOptionsForCourse(fizik));

  it("the main Konu list shows the unit masters, not their subtopics", () => {
    expect(main.filter((o) => isMasterId(o.id))).toHaveLength(8);
    const sub = topicGroups(fizik)[0].members[0];
    expect(main.some((o) => o.id === sub.id)).toBe(false);
    expect(groupOfTopic(fizik, sub.id)?.masterId).toBe(topicGroups(fizik)[0].masterId);
  });

  it("choosing a master (or one of its subtopics) opens the optional 'Alt konu' picker listing them", () => {
    const g = topicGroups(fizik)[0];
    const html = (topicId: string) => renderToStaticMarkup(<TopicGroupSelect course={fizik} topicId={topicId} onChange={() => {}} />);
    const out = html(g.masterId);
    expect(out).toContain("Alt konu (opsiyonel)");
    for (const t of g.members) expect(out).toContain(t.name.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
    expect(html(g.members[1].id)).toContain("Alt konu (opsiyonel)");
    expect(html("")).toBe("");
  });
});
