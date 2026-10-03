// "Maarif TYT" -- the 11th grade's own view of Kaynak Takibi combines the
// 9th and 10th grade curricula into one tab per subject, since TYT prep is
// cumulative across both years. A merged course is NOT a new copy of its
// source topics: every unit keeps its original id-bearing topics from
// maarif9.ts/maarif10.ts untouched, just concatenated (9th grade's units
// first, then 10th grade's) under one combined course id/name -- so a
// pipeline/resource-progress toggle an 11th grader makes here is keyed by
// that same real topic id, same as it would be for a 9th or 10th grader
// looking at their own single-grade course.
//
// Same-subject pairing across the two grades can't be done by matching
// course id suffixes or display names automatically -- e.g. 9th grade's
// "Din" (maarif9-din) is 10th grade's "Din Kültürü ve Ahlak Bilgisi"
// (maarif10-din-kulturu-ve-ahlak-bilgisi), different id AND different name
// for the same subject. Hand-curated pairing instead, verified directly
// against both grades' actual subject lists (lib/curriculum/maarif9.json,
// maarif10.json) at the time this was written. Felsefe has no 9th-grade
// counterpart (only introduced in 10th grade in the real curriculum).
import type { Course, Unit } from "./index";
import { MAARIF9_KAYNAK_COURSES } from "./maarif9";
import { MAARIF10_KAYNAK_COURSES } from "./maarif10";

type MergePair = { id: string; name: string; m9Id: string | null; m10Id: string | null };

const MERGE_PAIRS: MergePair[] = [
  { id: "maarif-tyt-turk-dili-ve-edebiyati", name: "Türk Dili ve Edebiyatı", m9Id: "maarif9-turk-dili-ve-edebiyati", m10Id: "maarif10-turk-dili-ve-edebiyati" },
  { id: "maarif-tyt-matematik", name: "Matematik", m9Id: "maarif9-matematik", m10Id: "maarif10-matematik" },
  { id: "maarif-tyt-cografya", name: "Coğrafya", m9Id: "maarif9-cografya", m10Id: "maarif10-cografya" },
  { id: "maarif-tyt-fizik", name: "Fizik", m9Id: "maarif9-fizik", m10Id: "maarif10-fizik" },
  { id: "maarif-tyt-kimya", name: "Kimya", m9Id: "maarif9-kimya", m10Id: "maarif10-kimya" },
  { id: "maarif-tyt-din-kulturu", name: "Din Kültürü ve Ahlak Bilgisi", m9Id: "maarif9-din", m10Id: "maarif10-din-kulturu-ve-ahlak-bilgisi" },
  { id: "maarif-tyt-tarih", name: "Tarih", m9Id: "maarif9-tarih", m10Id: "maarif10-tarih" },
  { id: "maarif-tyt-biyoloji", name: "Biyoloji", m9Id: "maarif9-biyoloji", m10Id: "maarif10-biyoloji" },
  { id: "maarif-tyt-felsefe", name: "Felsefe", m9Id: null, m10Id: "maarif10-felsefe" },
];

// Prefixed so the merged table's own Ünite column still shows which grade
// each unit came from. The "(9. Sınıf) " tag is part of the unit label (the
// only field a unit has), so the tag format lives here, in one place:
// splitUnitGradeTag reads it back so the table can put the grade on its own
// line above the unit's name.
function taggedUnits(units: Unit[], gradeLabel: string): Unit[] {
  return units.map((u) => ({ ...u, unit: `(${gradeLabel}) ${u.unit}` }));
}

const GRADE_TAG = /^\((\d+\. Sınıf)\)\s*(.*)$/;

// "(10. Sınıf) 1. Ünite: Sözün Ezgisi" -> { grade: "10. Sınıf", title: "1. Ünite:
// Sözün Ezgisi" }. A unit with no label of its own is just the tag, so its
// title is "". A label with no tag (every non-merged course) comes back
// whole, with grade null.
export function splitUnitGradeTag(label: string): { grade: string | null; title: string } {
  const m = GRADE_TAG.exec(label);
  return m ? { grade: m[1], title: m[2] } : { grade: null, title: label };
}

export const MAARIF_TYT_MERGED_COURSES: Course[] = MERGE_PAIRS.map(({ id, name, m9Id, m10Id }) => {
  const c9 = m9Id ? MAARIF9_KAYNAK_COURSES.find((c) => c.id === m9Id) : undefined;
  const c10 = m10Id ? MAARIF10_KAYNAK_COURSES.find((c) => c.id === m10Id) : undefined;
  return {
    id,
    name,
    units: [...(c9 ? taggedUnits(c9.units, "9. Sınıf") : []), ...(c10 ? taggedUnits(c10.units, "10. Sınıf") : [])],
  };
});

export function isMaarifTytMergedCourseId(courseId: string | null | undefined): boolean {
  return !!courseId && courseId.startsWith("maarif-tyt-");
}
