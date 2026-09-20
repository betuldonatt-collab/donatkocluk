// Flattens a course into table rows with the unit/konu rowSpan bookkeeping
// every curriculum table (Kaynak Takibi, Çıkmış Sorular, Deneme Analizleri,
// the coach's editable course table, ...) needs. One implementation instead
// of a per-table copy, so the LGS 3-level hierarchy (Ünite -> Konu -> Alt
// Konu) renders the same everywhere.
//
// YKS courses have no `konu` level, and come out exactly as before: every
// unit entry is its own span, "-" (ungrouped) topics are single-row units.
import type { Course, Topic } from "./index";

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
