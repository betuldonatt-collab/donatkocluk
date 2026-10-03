import { describe, expect, it } from "vitest";
import type { Course } from "./index";
import { maarifSelectionNodes } from "./maarif-selection";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";

const t = (id: string) => ({ id, name: id });

describe("maarifSelectionNodes", () => {
  it("a unit with no headings is a single node -- the whole unit, named by the unit", () => {
    const course: Course = {
      id: "maarif9-x",
      name: "X",
      units: [
        { unit: "TEMA 1", topics: [t("a"), t("b"), t("c")] },
        { unit: "TEMA 2", topics: [t("d")] },
      ],
    };
    const nodes = maarifSelectionNodes(course);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual({
      id: "a",
      label: "TEMA 1",
      unitLabel: "TEMA 1",
      readOnlyNames: ["a", "b", "c"],
      memberTopicIds: ["a", "b", "c"],
    });
    // A lone untitled topic is its own selectable leaf: named by itself, nothing listed under it.
    expect(nodes[1]).toEqual({ id: "d", label: "d", unitLabel: "TEMA 2", readOnlyNames: [], memberTopicIds: ["d"] });
  });

  it("splits a unit into one node per top-level heading, each tracked on its own", () => {
    const course: Course = {
      id: "maarif10-kimya",
      name: "Kimya",
      units: [
        {
          unit: "1. Ünite: Etkileşim",
          topics: [
            { id: "k1", name: "Kimyasal Tepkimeler › Oluşumu" },
            { id: "k2", name: "Kimyasal Tepkimeler › Türleri" },
            { id: "k3", name: "Gazlar › Özellikleri" },
            { id: "k4", name: "Gazlar › Kinetik Teori" },
            { id: "k5", name: "Gazlar › Yasaları" },
          ],
        },
      ],
    };
    const nodes = maarifSelectionNodes(course);
    expect(nodes.map((n) => [n.id, n.label, n.unitLabel, n.memberTopicIds])).toEqual([
      ["k1", "Kimyasal Tepkimeler", "1. Ünite: Etkileşim", ["k1", "k2"]],
      ["k3", "Gazlar", "1. Ünite: Etkileşim", ["k3", "k4", "k5"]],
    ]);
    expect(nodes[1].readOnlyNames).toEqual(["Gazlar › Özellikleri", "Gazlar › Kinetik Teori", "Gazlar › Yasaları"]);
  });

  it("a mixed unit keeps its untitled topics as their own groups between the headed ones", () => {
    const course: Course = {
      id: "maarif9-tde",
      name: "TDE",
      units: [
        {
          unit: "1. Tema",
          topics: [
            t("a"),
            { id: "b", name: "Metin Türleri › Deneme" },
            { id: "c", name: "Metin Türleri › Mülakat" },
            t("d"),
            t("e"),
            { id: "f", name: "Dil Bilgisi › Ses bilgisi" },
          ],
        },
      ],
    };
    const nodes = maarifSelectionNodes(course);
    expect(nodes.map((n) => [n.label, n.memberTopicIds])).toEqual([
      ["a", ["a"]],
      ["Metin Türleri", ["b", "c"]],
      ["1. Tema", ["d", "e"]],
      ["Dil Bilgisi", ["f"]],
    ]);
  });

  it("uses the group's first topic id as the node id -- never a synthetic id", () => {
    const course: Course = {
      id: "maarif9-y",
      name: "Y",
      units: [{ unit: "Ünite 1", topics: [t("real-topic-1"), t("real-topic-2")] }],
    };
    const [node] = maarifSelectionNodes(course);
    expect(node.id).toBe("real-topic-1");
  });

  it("skips a unit with no topics (never produces an id-less node)", () => {
    const course: Course = {
      id: "maarif9-z",
      name: "Z",
      units: [
        { unit: "Empty Unit", topics: [] },
        { unit: "Real Unit", topics: [t("a")] },
      ],
    };
    const nodes = maarifSelectionNodes(course);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].unitLabel).toBe("Real Unit");
  });

  it("never drops a topic across every real Maarif9 and merged Maarif TYT course", () => {
    for (const course of [...MAARIF9_KAYNAK_COURSES, ...MAARIF_TYT_MERGED_COURSES]) {
      const topicIds = course.units.flatMap((u) => u.topics.map((t) => t.id));
      const covered = maarifSelectionNodes(course).flatMap((n) => n.memberTopicIds);
      expect(covered.sort()).toEqual([...topicIds].sort());
    }
  });
});
