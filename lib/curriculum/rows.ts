// Flattens a course into table rows with the unit/konu rowSpan bookkeeping
// every curriculum table (Kaynak Takibi, Çıkmış Sorular, Deneme Analizleri,
// the coach's editable course table, ...) needs. One implementation instead
// of a per-table copy, so the LGS 3-level hierarchy (Ünite -> Konu -> Alt
// Konu) renders the same everywhere.
//
// YKS courses have no `konu` level, and come out exactly as before: every
// unit entry is its own span, "-" (ungrouped) topics are single-row units.
import { isLgsCourseId, isMaarifCourseId, type Course, type Topic } from "./index";
import { lgsSelectionNodes, type LgsSelectionNode } from "./lgs-selection";
import { maarifSelectionNodes } from "./maarif-selection";

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
// to. For a course with no rollup rule (every YKS TYT/AYT course) this is
// exactly flattenCourseRows, just reshaped (one topic == one row, nothing
// rolled up, readOnlyNames always empty) so every table that renders it
// needs only one code path. An LGS course rolls up via lgsSelectionNodes
// (per-subject rules, see lib/curriculum/lgs-selection.ts); a Maarif course
// (9th/10th/11th grade, or the 11th grade's merged "Maarif TYT" tab) rolls
// up via maarifSelectionNodes (uniformly one node per unit, see
// lib/curriculum/maarif-selection.ts) -- either way a rolled-up node
// becomes ONE row (id = a real topic id) with its members' names listed in
// readOnlyNames, so the table can show them as plain read-only context
// under the selectable label instead of their own rows/checkboxes --
// nothing is dropped, it just stops being individually interactive. Always
// exactly 2 sticky columns worth of bookkeeping (Ünite + the selectable
// label) since Konu/Alt Konu never need a column of their own anymore:
// Konu either became a node's own label or a node's read-only members'
// description.
export type SelectionRow = {
  id: string;
  label: string;
  unitLabel: string;
  unitRowSpan: number | null;
  // A Maarif TYT bucket's intermediate heading within its unit; undefined for
  // every other course. See withGroupHeadings.
  groupLabel?: string;
  readOnlyNames: string[];
  memberTopicIds: string[];
};

function rowsFromNodes(nodes: LgsSelectionNode[]): SelectionRow[] {
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
        ...(node.groupLabel !== undefined ? { groupLabel: node.groupLabel } : {}),
        readOnlyNames: node.readOnlyNames,
        memberTopicIds: node.memberTopicIds,
      });
    });
    i = j;
  }
  return rows;
}

// A course laid out as one flat list (Türkçe) has the empty string for its unit
// label: its tables leave out the Ünite column entirely.
export const FLAT_UNIT_LABEL = "";

export function isFlatRows(rows: SelectionRow[]): boolean {
  return rows.length > 0 && rows.every((r) => r.unitLabel === FLAT_UNIT_LABEL);
}

// Rows with their intermediate group headings spliced in. A unit whose rows
// carry a groupLabel (Kimya: Tema -> "Kimya Hayattır" -> bucket) gets one
// heading row at the start of each group, and its unit cell spans the headings
// too; every other unit passes through exactly as it is. Tables render this
// instead of the bare rows.
export type HeadedRow =
  | { kind: "heading"; key: string; label: string; unitLabel: string; unitRowSpan: number | null }
  | { kind: "row"; row: SelectionRow; unitRowSpan: number | null };

export function withGroupHeadings(rows: SelectionRow[]): HeadedRow[] {
  const out: HeadedRow[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].unitRowSpan === null) j++;
    const block = rows.slice(i, j);
    if (!block.some((r) => r.groupLabel !== undefined)) {
      for (const row of block) out.push({ kind: "row", row, unitRowSpan: row.unitRowSpan });
    } else {
      const items: HeadedRow[] = [];
      let previous: string | undefined;
      block.forEach((row, idx) => {
        if (row.groupLabel !== undefined && row.groupLabel !== previous) {
          items.push({ kind: "heading", key: `${row.unitLabel}::${idx}::${row.groupLabel}`, label: row.groupLabel, unitLabel: row.unitLabel, unitRowSpan: null });
        }
        previous = row.groupLabel;
        items.push({ kind: "row", row, unitRowSpan: null });
      });
      items[0].unitRowSpan = items.length;
      out.push(...items);
    }
    i = j;
  }
  return out;
}

export function flattenSelectionRows(course: Course): SelectionRow[] {
  if (isLgsCourseId(course.id)) return rowsFromNodes(lgsSelectionNodes(course));
  if (isMaarifCourseId(course.id)) return rowsFromNodes(maarifSelectionNodes(course));

  return flattenCourseRows(course).map((r) => ({
    id: r.topic.id,
    label: r.topic.name,
    unitLabel: r.unitLabel,
    unitRowSpan: r.unitRowSpan,
    readOnlyNames: [],
    memberTopicIds: [r.topic.id],
  }));
}
