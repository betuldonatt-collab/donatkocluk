// Flattens a course into table rows with the unit/konu rowSpan bookkeeping
// every curriculum table (Kaynak Takibi, Çıkmış Sorular, Deneme Analizleri,
// the coach's editable course table, ...) needs. One implementation instead
// of a per-table copy, so the LGS 3-level hierarchy (Ünite -> Konu -> Alt
// Konu) renders the same everywhere.
//
// YKS courses have no `konu` level, and come out exactly as before: every
// unit entry is its own span, "-" (ungrouped) topics are single-row units.
import { isLgsCourseId, type Course, type Topic } from "./index";
import { lgsSelectionNodes } from "./lgs-selection";

export type CourseRow = {
  topic: Topic;
  unitLabel: string;
  // null = this cell is covered by a previous row's rowSpan.
  unitRowSpan: number | null;
  // The middle level. null when this row's topic IS the Konu (2-level
  // subjects, and any YKS course) -- see courseHasKonu for the table-wide
  // "does this course have a Konu column at all" check.
  konuLabel: string | null;
  konuRowSpan: number | null;
};

export function courseHasKonu(course: Course): boolean {
  return course.units.some((u) => u.konu !== undefined);
}

export function flattenCourseRows(course: Course): CourseRow[] {
  const rows: CourseRow[] = [];
  const units = course.units;

  let i = 0;
  while (i < units.length) {
    // A "unit block" is a run of consecutive entries sharing one unit name
    // -- merged into a single Ünite cell only when they carry a konu (LGS
    // stores one entry per (unit, konu) pair). Without a konu each entry
    // stays its own span, exactly as YKS always rendered.
    let j = i + 1;
    if (units[i].konu !== undefined) {
      while (j < units.length && units[j].unit === units[i].unit) j++;
    }
    const block = units.slice(i, j);
    const blockSize = block.reduce((n, e) => n + e.topics.length, 0);
    let blockRowIndex = 0;

    for (const entry of block) {
      entry.topics.forEach((topic, ti) => {
        const isUngrouped = entry.unit === "-";
        rows.push({
          topic,
          unitLabel: entry.unit,
          unitRowSpan: isUngrouped ? 1 : blockRowIndex === 0 ? blockSize : null,
          konuLabel: entry.konu ?? null,
          konuRowSpan: entry.konu !== undefined && ti === 0 ? entry.topics.length : null,
        });
        blockRowIndex++;
      });
    }
    i = j;
  }
  return rows;
}

// One row per checkable/selectable unit for a curriculum table -- the row
// the coach asked to collapse Task Assignment/Kaynak Takibi/Analiz down
// to. For any non-LGS course this is exactly flattenCourseRows, just
// reshaped (one topic == one row, nothing rolled up, readOnlyNames always
// empty) so every table that renders it needs only one code path. For an
// LGS course, rows come from lgsSelectionNodes instead: a rolled-up node
// becomes ONE row (id = a real topic id, see lib/curriculum/lgs-selection.ts)
// with its members' names listed in readOnlyNames, so the table can show
// them as plain read-only context under the selectable label instead of
// their own rows/checkboxes -- nothing is dropped, it just stops being
// individually interactive. Always exactly 2 sticky columns worth of
// bookkeeping (Ünite + the selectable label) since Konu/Alt Konu never
// need a column of their own anymore: Konu either became a node's own
// label (Matematik, Fen Ünite 7) or a node's read-only members'
// description (Türkçe, İnkılap Tarihi, Din Kültürü).
export type SelectionRow = {
  id: string;
  label: string;
  unitLabel: string;
  unitRowSpan: number | null;
  readOnlyNames: string[];
  memberTopicIds: string[];
};

export function flattenSelectionRows(course: Course): SelectionRow[] {
  if (!isLgsCourseId(course.id)) {
    return flattenCourseRows(course).map((r) => ({
      id: r.topic.id,
      label: r.topic.name,
      unitLabel: r.unitLabel,
      unitRowSpan: r.unitRowSpan,
      readOnlyNames: [],
      memberTopicIds: [r.topic.id],
    }));
  }

  const nodes = lgsSelectionNodes(course);
  const rows: SelectionRow[] = [];
  let i = 0;
  while (i < nodes.length) {
    let j = i + 1;
    while (j < nodes.length && nodes[j].unitLabel === nodes[i].unitLabel) j++;
    const block = nodes.slice(i, j);
    block.forEach((node, idx) => {
      rows.push({
        id: node.id,
        label: node.label,
        unitLabel: node.unitLabel,
        unitRowSpan: idx === 0 ? block.length : null,
        readOnlyNames: node.readOnlyNames,
        memberTopicIds: node.memberTopicIds,
      });
    });
    i = j;
  }
  return rows;
}
