import { describe, expect, it } from "vitest";
import type { Course } from "./index";
import { maarifSelectionNodes } from "./maarif-selection";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF_TYT_MERGED_COURSES } from "./maarif-tyt";

const t = (id: string) => ({ id, name: id });

describe("maarifSelectionNodes", () => {
  it("collapses every unit to exactly one node, uniformly -- no per-subject exceptions", () => {
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
    expect(nodes[1]).toEqual({
      id: "d",
      label: "TEMA 2",
      unitLabel: "TEMA 2",
      readOnlyNames: ["d"],
      memberTopicIds: ["d"],
    });
  });

  it("uses the unit's first topic id as the node id -- never a synthetic id", () => {
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
