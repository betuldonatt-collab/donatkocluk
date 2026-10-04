// Maarif curriculum (9th/10th/11th grade, and the 11th grade's own merged
// "Maarif TYT" tab) UI simplification: the raw curriculum stays exactly as
// granular as the official workbook -- this module never touches it -- but
// Kaynak Takibi needs a coarser "selectable" node, per the coach's explicit
// request that a tracking checkbox next to every single subtopic was too
// cluttered. Unlike LGS (lib/curriculum/lgs-selection.ts), which rolls up
// differently per subject, every Maarif subject uses the SAME rule: one
// selectable node per heading GROUP of a unit (see topicGroupsForUnit) -- the
// table shows a unit's headings as sections ("Kimyasal Tepkimeler", "Gazlar"),
// and each section is tracked on its own. A unit with no headings is a single
// group, i.e. the whole unit. Every topic a node contains stays visible
// underneath as read-only context, never deleted or hidden.
//
// A node's `id` is always a REAL topic id (the group's first topic) -- never
// synthetic, same reasoning as lgs-selection.ts: validatePipelineStep and
// every "is this topic_id real" check keeps accepting it unchanged.
import type { LgsSelectionNode } from "./lgs-selection";
import type { Course } from "./index";
import { topicGroupsForUnit } from "./topic-display";

// True for a course laid out in buckets (Unit.bucket) -- every one of its
// units is a leaf the UI shows by its bucket label alone.
export function courseHasBuckets(course: Course): boolean {
  return course.units.some((u) => u.bucket !== undefined);
}

export function maarifSelectionNodes(course: Course): LgsSelectionNode[] {
  return course.units.flatMap((unit): LgsSelectionNode[] => {
    // A bucket is one leaf: the label alone, nothing listed beneath it. Its raw
    // topics are only its members (ids) -- the first one is the real id that
    // tracking is saved against.
    if (unit.bucket !== undefined && unit.topics.length > 0) {
      return [
        {
          id: unit.topics[0].id,
          label: unit.bucket,
          unitLabel: unit.unit,
          ...(unit.group !== undefined ? { groupLabel: unit.group } : {}),
          readOnlyNames: [],
          memberTopicIds: unit.topics.map((t) => t.id),
        },
      ];
    }
    return maarifGroupNodes(unit);
  });
}

function maarifGroupNodes(unit: Course["units"][number]): LgsSelectionNode[] {
  return topicGroupsForUnit(unit.topics).map((group) => {
    const [first] = group.topics;
    const single = group.topics.length === 1;
    return {
      id: first.id,
      // A headed group is named by its heading; a lone untitled topic by its
      // own name (nothing left to list under it); an untitled run by the unit.
      label: group.heading ?? (single ? first.name : unit.unit),
      unitLabel: unit.unit,
      readOnlyNames: group.heading === null && single ? [] : group.topics.map((t) => t.name),
      memberTopicIds: group.topics.map((t) => t.id),
    };
  });
}
