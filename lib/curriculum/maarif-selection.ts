// Maarif curriculum (9th/10th/11th grade, and the 11th grade's own merged
// "Maarif TYT" tab) UI simplification: the raw curriculum stays exactly as
// granular as the official workbook -- this module never touches it -- but
// Kaynak Takibi needs a coarser "selectable" node per subject, per the
// coach's explicit request that a tracking checkbox next to every single
// subtopic was too cluttered. Unlike LGS (lib/curriculum/lgs-selection.ts),
// which rolls up differently per subject (Konu-level for some, Ünite-level
// for others, named exceptions for Din Kültürü), every Maarif subject uses
// the SAME rule: one selectable node per UNIT, no exceptions -- every topic
// it contains stays visible underneath as read-only context, never deleted
// or hidden.
//
// A node's `id` is always a REAL topic id (the unit's first topic) -- never
// synthetic, same reasoning as lgs-selection.ts: validatePipelineStep and
// every "is this topic_id real" check keeps accepting it unchanged.
import type { LgsSelectionNode } from "./lgs-selection";
import type { Course } from "./index";

export function maarifSelectionNodes(course: Course): LgsSelectionNode[] {
  return course.units
    .filter((u) => u.topics.length > 0)
    .map((u) => ({
      id: u.topics[0].id,
      label: u.unit,
      unitLabel: u.unit,
      readOnlyNames: u.topics.map((t) => t.name),
      memberTopicIds: u.topics.map((t) => t.id),
    }));
}
