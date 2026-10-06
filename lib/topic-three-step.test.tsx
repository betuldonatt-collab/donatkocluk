import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TopicGroupSelect } from "@/components/topic-group-select";
import { findCourseById, topicOptionsForCourse } from "./curriculum";
import { MAARIF10_KAYNAK_COURSES, MAARIF10_NATIVE_COURSES } from "./curriculum/maarif10";
import { MAARIF7_KAYNAK_COURSES, MAARIF7_NATIVE_COURSES } from "./curriculum/maarif7";
import { MAARIF9_KAYNAK_COURSES, MAARIF9_NATIVE_COURSES } from "./curriculum/maarif9";
import { MAARIF_TYT_MERGED_COURSES } from "./curriculum/maarif-tyt";
import { maarifSelectionNodes } from "./curriculum/maarif-selection";
import {
  groupHeadingStructure,
  mainTopicOptions,
  pickSecondStep,
  splitTopicHeading,
  topicGroups,
  unitMasterId,
  withoutUnitMasters,
} from "./curriculum/topic-groups";

const course = (id: string) => findCourseById(id)!;
const html = (courseId: string, topicId: string) => renderToStaticMarkup(<TopicGroupSelect course={course(courseId)} topicId={topicId} onChange={() => {}} />);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// units with two or more topics, counted per distinct label, in the NATIVE data
const multiTopicUnits = (c: { units: { unit: string; topics: unknown[] }[] }) => {
  const sizes = new Map<string, number>();
  for (const u of c.units) if (u.unit && u.unit !== "-") sizes.set(u.unit, (sizes.get(u.unit) ?? 0) + u.topics.length);
  return [...sizes.values()].filter((n) => n >= 2).length;
};

describe("Maarif 7th / 9th / 10th grade: a master for every unit with two or more topics", () => {
  const SETS = [
    { grade: "7", native: MAARIF7_NATIVE_COURSES, full: MAARIF7_KAYNAK_COURSES, total: 33 },
    { grade: "9", native: MAARIF9_NATIVE_COURSES, full: MAARIF9_KAYNAK_COURSES, total: 34 },
    { grade: "10", native: MAARIF10_NATIVE_COURSES, full: MAARIF10_KAYNAK_COURSES, total: 32 },
  ];

  for (const { grade, native, full, total } of SETS) {
    it(`${grade}. Sınıf: ${total} masters in all, one per unit with two or more topics`, () => {
      let sum = 0;
      for (const c of full) {
        const groups = topicGroups(c);
        expect(groups, c.id).toHaveLength(multiTopicUnits(native.find((n) => n.id === c.id)!));
        sum += groups.length;
      }
      expect(sum).toBe(total);
    });

    it(`${grade}. Sınıf: nothing that existed moves -- same topics, ids and order, the master last in its unit`, () => {
      for (const c of full) {
        const n = native.find((x) => x.id === c.id)!;
        expect(withoutUnitMasters(c), c.id).toEqual(n);
        for (const g of topicGroups(c)) {
          const unit = c.units.find((u) => u.unit === g.unitLabel)!;
          expect(unit.topics[unit.topics.length - 1].id, g.unitLabel).toBe(g.masterId);
          expect(g.masterId).toBe(unitMasterId(c.id, c.units.findIndex((u) => u.unit === g.unitLabel)));
          expect(unit.topics[unit.topics.length - 1].name).not.toMatch(/^\d/);
        }
      }
    });

    it(`${grade}. Sınıf: every existing Kaynak Takibi row keeps its id (saved ticks are keyed by it)`, () => {
      for (const c of full) {
        const before = maarifSelectionNodes(native.find((x) => x.id === c.id)!).map((nd) => nd.id);
        const after = new Set(maarifSelectionNodes(c).map((nd) => nd.id));
        for (const id of before) expect(after.has(id), `${c.id} ${id}`).toBe(true);
      }
    });
  }

  it("the flat ones stay flat: 7. Sınıf İngilizce (one topic per theme) and 10. Sınıf Felsefe (one per unit)", () => {
    expect(topicGroups(course("maarif7-ingilizce"))).toEqual([]);
    expect(topicGroups(course("maarif10-felsefe"))).toEqual([]);
  });

  it("the merged Maarif TYT courses are built from the native lists: no 9th / 10th-grade master leaks in", () => {
    for (const c of MAARIF_TYT_MERGED_COURSES) {
      const masters = c.units.flatMap((u) => u.topics.map((t) => t.id)).filter((id) => /-genel-u\d+$/.test(id));
      expect(masters.every((id) => id.startsWith(c.id + "-genel-u")), c.id).toBe(true);
    }
  });

  it("the main Konu list of a 9th-grade course shows the units, not their dozens of topics", () => {
    const fizik = course("maarif9-fizik");
    const main = mainTopicOptions(fizik, topicOptionsForCourse(fizik));
    expect(main.filter((o) => /-genel-u\d+$/.test(o.id))).toHaveLength(4);
    expect(main.length).toBeLessThan(topicOptionsForCourse(fizik).length / 3);
  });
});

describe("headings: splitting a name and the structure of a group", () => {
  it("splits 'Heading › Topic' into heading and leaf, a deeper path keeps the rest together, a plain name has no heading", () => {
    expect(splitTopicHeading("Vektörler › Vektörlerin Toplanması")).toEqual({ heading: "Vektörler", leaf: "Vektörlerin Toplanması" });
    expect(splitTopicHeading("A › B › C")).toEqual({ heading: "A", leaf: "B › C" });
    expect(splitTopicHeading("Basınç")).toEqual({ heading: null, leaf: "Basınç" });
  });

  it("a mixed unit lists loose topics and each heading once, in curriculum order", () => {
    const g = topicGroups(course("maarif9-fizik")).find((x) => x.unitLabel.includes("Kuvvet ve Hareket"))!;
    const { hasHeadings, entries } = groupHeadingStructure(g);
    expect(hasHeadings).toBe(true);
    expect(entries.slice(0, 3).map((e) => (e.kind === "heading" ? "H:" + e.heading : "T:" + e.label))).toEqual(["T:Temel Ve Türetilmiş Nicelikler", "T:Skaler Ve Vektörel Nicelikler", "H:Vektörler"]);
    const vektorler = entries.find((e) => e.kind === "heading" && e.heading === "Vektörler");
    expect(vektorler && vektorler.kind === "heading" && vektorler.topics.map((t) => t.label)).toEqual(["Vektörlerin Özellikleri", "Vektörlerin Toplanması", "Vektörlerin Toplanmasında Kullanılan Yöntemler"]);
    // every subtopic appears exactly once across the entries
    const ids = entries.flatMap((e) => (e.kind === "heading" ? e.topics.map((t) => t.id) : [e.id]));
    expect(ids).toEqual(g.members.map((t) => t.id));
  });

  it("a group whose subtopics have no heading is a plain two-step group", () => {
    expect(groupHeadingStructure(topicGroups(course("tyt-fizik"))[0]).hasHeadings).toBe(false);
    expect(groupHeadingStructure(topicGroups(course("maarif7-turkce"))[0]).hasHeadings).toBe(false);
  });
});

describe("the second step's transitions", () => {
  const group = topicGroups(course("maarif9-fizik")).find((x) => x.unitLabel.includes("Kuvvet ve Hareket"))!;
  const loose = group.members[0];
  const underVektorler = group.members.filter((t) => splitTopicHeading(t.name).heading === "Vektörler");

  it("'Genel' goes back to the unit's master and closes the heading step", () => {
    expect(pickSecondStep(group, underVektorler[0].id, "")).toEqual({ pickedHeading: "", topicId: group.masterId });
  });

  it("choosing a heading keeps the unit's master until an Alt başlık is chosen", () => {
    expect(pickSecondStep(group, group.masterId, "h:Vektörler")).toEqual({ pickedHeading: "Vektörler", topicId: group.masterId });
    // from a topic under another heading, the old topic is dropped
    expect(pickSecondStep(group, loose.id, "h:Vektörler").topicId).toBe(group.masterId);
  });

  it("re-choosing the heading of the topic already stored keeps that topic", () => {
    expect(pickSecondStep(group, underVektorler[1].id, "h:Vektörler")).toEqual({ pickedHeading: "Vektörler", topicId: underVektorler[1].id });
  });

  it("a subtopic without a heading is stored directly", () => {
    expect(pickSecondStep(group, group.masterId, loose.id)).toEqual({ pickedHeading: "", topicId: loose.id });
  });
});

describe("the picker in the form: Ünite -> Başlık -> Alt başlık", () => {
  const g = topicGroups(course("maarif9-fizik")).find((x) => x.unitLabel.includes("Kuvvet ve Hareket"))!;
  const sub = g.members.find((t) => splitTopicHeading(t.name).heading === "Vektörler")!;
  const loose = g.members[0];

  it("with the unit's master chosen only the Başlık step shows: Genel, the headings and the loose subtopics", () => {
    const out = html("maarif9-fizik", g.masterId);
    expect(out).toContain("Başlık (opsiyonel)");
    expect(out).not.toContain("Alt başlık (opsiyonel)");
    expect(out).toContain(">Genel<");
    expect(out).toContain(">Vektörler<");
    expect(out).toContain(esc(loose.name));
    // the long "Heading › Topic" text is not stuffed into the box
    expect(out).not.toContain("Vektörler › Vektörlerin");
  });

  it("with a topic under a heading chosen, both steps show: the heading selected, its topics in the third box", () => {
    const out = html("maarif9-fizik", sub.id);
    expect(out).toContain("Başlık (opsiyonel)");
    expect(out).toContain("Alt başlık (opsiyonel)");
    expect(out).toMatch(/<option value="h:Vektörler" selected/);
    expect(out).toContain(`<option value="${sub.id}" selected`);
    expect(out).toContain(esc(splitTopicHeading(sub.name).leaf));
    expect(out).not.toContain("Vektörler › Vektörlerin");
  });

  it("with a loose subtopic chosen, only the Başlık step shows, with that subtopic selected", () => {
    const out = html("maarif9-fizik", loose.id);
    expect(out).toContain(`<option value="${loose.id}" selected`);
    expect(out).not.toContain("Alt başlık (opsiyonel)");
  });

  it("a flat topic shows nothing; a group without headings keeps the single 'Alt konu' step", () => {
    expect(html("maarif7-ingilizce", "maarif7-ingilizce-u0-t0")).toBe("");
    expect(html("tyt-fizik", topicGroups(course("tyt-fizik"))[0].masterId)).toContain("Alt konu (opsiyonel)");
    expect(html("tyt-fizik", topicGroups(course("tyt-fizik"))[0].masterId)).not.toContain("Başlık (opsiyonel)");
  });

  it("works for the 7th, 10th and 11th grade and the merged Maarif TYT courses too", () => {
    for (const id of ["maarif7-fen-bilimleri", "maarif10-biyoloji", "maarif11-fizik", "maarif-tyt-biyoloji"]) {
      const group = topicGroups(course(id)).find((x) => groupHeadingStructure(x).hasHeadings)!;
      expect(group, id).toBeTruthy();
      expect(html(id, group.masterId), id).toContain("Başlık (opsiyonel)");
    }
  });
});

describe("the new masters in the tables and lists", () => {
  it("master names are unique within every course of the 7th / 9th / 10th grade (a repeated unit title is told apart)", () => {
    for (const c of [...MAARIF7_KAYNAK_COURSES, ...MAARIF9_KAYNAK_COURSES, ...MAARIF10_KAYNAK_COURSES]) {
      const names = c.units.flatMap((u) => u.topics).filter((t) => /-genel-u\d+$/.test(t.id)).map((t) => t.name);
      expect(new Set(names).size, c.id).toBe(names.length);
    }
  });

  it("Kaynak Takibi renders every 7th / 9th / 10th-grade course with its masters, one more row per grouped unit at most", async () => {
    const { CourseTable } = await import("@/app/student/kaynak-takibi/_components/course-table");
    for (const c of [...MAARIF7_KAYNAK_COURSES, ...MAARIF9_KAYNAK_COURSES, ...MAARIF10_KAYNAK_COURSES]) {
      const out = renderToStaticMarkup(
        <CourseTable
          course={c}
          resources={[{ id: "r1", name: "Kaynak A" }]}
          progress={{}}
          topicStats={{ byTopic: {}, karma: { total: 0, correct: 0, wrong: 0, empty: 0 } }}
          onAddResource={async () => {}}
          onToggle={() => {}}
        />,
      );
      expect(out.length, c.id).toBeGreaterThan(500);
      // every master is listed in its unit (as a line of the last row, or a row of its own)
      for (const g of topicGroups(c)) {
        const name = c.units.flatMap((u) => u.topics).find((t) => t.id === g.masterId)!.name;
        expect(out, `${c.id} ${g.masterId}`).toContain(esc(name));
      }
    }
  }, 60_000);
});
